import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { HeadObjectCommand, NotFound, S3Client } from '@aws-sdk/client-s3';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { teamStateSchema, type Question } from '@treasurehunt/shared';
import { handler as photoUpload } from '../src/handlers/team/submission-upload.js';
import { handler as submitPhoto } from '../src/handlers/team/submit-photo.js';
import { handler as videoCall } from '../src/handlers/team/video-call.js';
import { clearContentCache } from '../src/lib/content.js';
import { clock } from '../src/lib/clock.js';
import type { TeamRecord } from '../src/lib/game.js';
import { applyReview, listPendingReviews } from '../src/lib/review.js';
import { clearWhatsappCache, toWhatsappUrl } from '../src/lib/whatsapp.js';
import { parse, teamEvent } from './events.js';
import { attempt, contentConfig, profile, q1, q4, record, stage, teamItems } from './fixtures.js';

const db = mockClient(DynamoDBDocumentClient);
const s3 = mockClient(S3Client);
const ssm = mockClient(SSMClient);
const NOW = new Date('2026-10-28T10:10:00.000Z');
const ID = '00000000-0000-4000-8000-0000000000aa';
const running = { status: 'revealed' as const, runningSince: '2026-10-28T10:08:00.000Z' };

const q3 = {
  ...q4,
  id: 'q3',
  type: 'photo',
  clue: { text: 'Bridge' },
  question: { text: 'Troll faces on the bridge' },
} as Question;

// Route A here: q1, q3 (photo), q4 (dance).
const onPhoto = (overrides = {}) =>
  record({
    profile: profile({ currentStage: 2 }),
    stages: [
      stage({ status: 'completed' }),
      stage({ stage: 2, questionId: 'q3', activeMs: 30_000, ...running, ...overrides }),
    ],
  });
const onDance = (overrides = {}) =>
  record({
    profile: profile({ currentStage: 3 }),
    stages: [stage({ stage: 3, questionId: 'q4', ...running, ...overrides })],
  });

const given = (r: TeamRecord) => {
  db.on(GetCommand, { TableName: 'game-table' }).resolves({ Item: { status: 'live' } });
  db.on(QueryCommand).resolves({ Items: teamItems(r) });
};
const transactItems = () => db.commandCalls(TransactWriteCommand)[0]!.args[0].input.TransactItems!;

beforeEach(() => {
  db.reset();
  s3.reset();
  ssm.reset();
  clearContentCache();
  clearWhatsappCache();
  clock.now = () => NOW;
  process.env.WHATSAPP_PARAM = '/treasurehunt/test/gm-whatsapp-number';
  ssm.on(GetParameterCommand).resolves({ Parameter: { Value: '+44 7700 900123' } });
  const content: Record<string, Record<string, unknown>> = {
    'CONFIG|CONFIG': contentConfig,
    'ROUTE#A|ROUTE': { questionIds: ['q1', 'q3', 'q4'] },
    'QUESTION#q1|QUESTION': q1,
    'QUESTION#q3|QUESTION': q3,
    'QUESTION#q4|QUESTION': q4,
  };
  for (const [key, item] of Object.entries(content)) {
    const [PK, SK] = key.split('|');
    db.on(GetCommand, { TableName: 'content-table', Key: { PK, SK } }).resolves({ Item: item });
  }
});

describe('POST /teams/me/current/photo-upload', () => {
  it('signs an upload for this team, stage and attempt only', async () => {
    given(onPhoto());
    const res = parse(await photoUpload(teamEvent('team-1', { stage: 2, attemptId: ID })));
    expect(res.status).toBe(200);
    expect(res.body.key).toBe(`teams/team-1/submissions/02-${ID}.jpg`);
    expect(res.body.fields['Content-Type']).toBe('image/jpeg');
  });

  it('refuses on a question that is not a photo', async () => {
    given(record({ stages: [stage(running)] }));
    const res = parse(await photoUpload(teamEvent('team-1', { stage: 1, attemptId: ID })));
    expect(res.status).toBe(409);
  });
});

describe('POST /teams/me/current/photo', () => {
  it('queues the photo for review and pauses the timer', async () => {
    given(onPhoto());
    s3.on(HeadObjectCommand).resolves({});
    const res = parse(await submitPhoto(teamEvent('team-1', { stage: 2, attemptId: ID })));
    expect(res.status).toBe(200);
    const [put, update] = transactItems();
    expect(put!.Put!.Item).toMatchObject({
      SK: `ATTEMPT#02#${ID}`,
      type: 'photo',
      result: 'pending',
      photoKey: `teams/team-1/submissions/02-${ID}.jpg`,
      GSI1PK: 'REVIEW#PENDING',
      GSI1SK: NOW.toISOString(),
    });
    expect(update!.Update).toMatchObject({
      UpdateExpression: 'SET #status = :awaiting, activeMs = :activeMs REMOVE runningSince',
      ConditionExpression: '#status = :revealed AND runningSince = :runningSince',
      ExpressionAttributeValues: { ':activeMs': 150_000, ':awaiting': 'awaiting_review' },
    });
  });

  it('asks for the upload first if the photo has not arrived', async () => {
    given(onPhoto());
    s3.on(HeadObjectCommand).rejects(new NotFound({ message: 'x', $metadata: {} }));
    const res = parse(await submitPhoto(teamEvent('team-1', { stage: 2, attemptId: ID })));
    expect(res.status).toBe(400);
    expect(db.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('applies a retried submission once', async () => {
    given(onPhoto({ status: 'awaiting_review', runningSince: undefined }));
    db.on(QueryCommand).resolves({
      Items: teamItems({
        ...onPhoto({ status: 'awaiting_review', runningSince: undefined }),
        attempts: [attempt({ stage: 2, attemptId: ID, type: 'photo', result: 'pending' })],
      }),
    });
    const res = parse(await submitPhoto(teamEvent('team-1', { stage: 2, attemptId: ID })));
    expect(res.status).toBe(200);
    expect(res.body.current.status).toBe('awaiting_review');
    expect(db.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });
});

describe('POST /teams/me/current/video-call', () => {
  it('pauses the timer, queues the call and returns the WhatsApp link', async () => {
    given(onDance());
    const res = parse(await videoCall(teamEvent('team-1', { stage: 3, attemptId: ID })));
    expect(res.status).toBe(200);
    expect(transactItems()[0]!.Put!.Item).toMatchObject({ type: 'video_call', result: 'pending' });
    const state = teamStateSchema.parse(res.body);
    expect(state.current?.whatsappUrl).toBe('https://wa.me/447700900123');
  });

  it('is only for the dance', async () => {
    given(onPhoto());
    const res = parse(await videoCall(teamEvent('team-1', { stage: 2, attemptId: ID })));
    expect(res.status).toBe(409);
  });

  it('still works without a WhatsApp number', async () => {
    given(onDance());
    ssm.on(GetParameterCommand).rejects(new Error('ParameterNotFound'));
    const res = parse(await videoCall(teamEvent('team-1', { stage: 3, attemptId: ID })));
    expect(res.status).toBe(200);
    expect(res.body.current.whatsappUrl).toBeNull();
  });
});

describe('GM review', () => {
  const pendingPhoto = () => ({
    ...onPhoto({ status: 'awaiting_review', runningSince: undefined, activeMs: 150_000 }),
    attempts: [
      attempt({ stage: 2, attemptId: ID, questionId: 'q3', type: 'photo', result: 'pending' }),
    ],
  });
  const review = (decision: 'approved' | 'declined', reason?: string) =>
    applyReview({ teamId: 'team-1', attemptId: ID, decision, reason, now: NOW });

  it('approving a photo completes the stage and opens the next clue', async () => {
    given(pendingPhoto());
    expect(await review('approved')).toBe(true);
    const [decide, stageUpdate, , next] = transactItems();
    expect(decide!.Update).toMatchObject({
      UpdateExpression: 'SET #result = :decision, reviewedAt = :now REMOVE GSI1PK, GSI1SK',
      ConditionExpression: '#result = :pending',
    });
    expect(stageUpdate!.Update!.ExpressionAttributeValues).toMatchObject({
      ':outcome': 'approved',
      ':activeMs': 150_000,
      ':expected': 'awaiting_review',
    });
    expect(next!.Put!.Item).toMatchObject({ SK: 'STAGE#03', questionId: 'q4' });
  });

  it('declining a photo adds the penalty, keeps the reason and restarts the timer', async () => {
    given(pendingPhoto());
    await review('declined', 'Whole team must be in shot');
    const [decide, stageUpdate] = transactItems();
    expect(decide!.Update!.ExpressionAttributeValues).toMatchObject({
      ':decision': 'declined',
      ':reason': 'Whole team must be in shot',
    });
    expect(stageUpdate!.Update!.ExpressionAttributeValues).toMatchObject({
      ':revealed': 'revealed',
      ':now': NOW.toISOString(),
      ':p': 300_000,
    });
  });

  it('declining the dance adds the penalty and finishes the team', async () => {
    given({
      ...onDance({ status: 'awaiting_review', runningSince: undefined }),
      attempts: [
        attempt({
          stage: 3,
          attemptId: ID,
          questionId: 'q4',
          type: 'video_call',
          result: 'pending',
        }),
      ],
    });
    await review('declined');
    const [, stageUpdate, teamUpdate, next] = transactItems();
    expect(stageUpdate!.Update!.ExpressionAttributeValues).toMatchObject({
      ':outcome': 'declined',
      ':penaltyMs': 300_000,
    });
    expect(teamUpdate!.Update!.ExpressionAttributeValues).toMatchObject({
      ':finished': 'finished',
    });
    expect(next).toBeUndefined();
  });

  it('ignores a second decision on the same submission', async () => {
    given({
      ...pendingPhoto(),
      attempts: [attempt({ stage: 2, attemptId: ID, type: 'photo', result: 'approved' })],
    });
    expect(await review('declined')).toBe(false);
    expect(db.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('lists the queue with team names', async () => {
    db.on(QueryCommand, { IndexName: 'GSI1' }).resolves({
      Items: [
        {
          PK: 'TEAM#team-1',
          ...attempt({
            stage: 2,
            attemptId: ID,
            type: 'photo',
            result: 'pending',
            photoKey: 'teams/team-1/submissions/x.jpg',
          }),
        },
      ],
    });
    db.on(GetCommand, {
      TableName: 'game-table',
      Key: { PK: 'TEAM#team-1', SK: 'PROFILE' },
    }).resolves({
      Item: profile(),
    });
    expect(await listPendingReviews()).toEqual([
      expect.objectContaining({
        teamId: 'team-1',
        teamName: 'The Wanderers',
        stage: 2,
        attemptId: ID,
        photoKey: 'teams/team-1/submissions/x.jpg',
      }),
    ]);
  });
});

describe('toWhatsappUrl', () => {
  it('keeps digits only', () => {
    expect(toWhatsappUrl('+44 7700-900123')).toBe('https://wa.me/447700900123');
    expect(toWhatsappUrl('')).toBeNull();
  });
});
