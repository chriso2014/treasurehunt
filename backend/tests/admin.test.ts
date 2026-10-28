import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { adminTeamsResponseSchema, resultsResponseSchema } from '@treasurehunt/shared';
import { handler as acceptAnswer } from '../src/handlers/admin/accept-answer.js';
import { handler as publish } from '../src/handlers/admin/publish-results.js';
import { handler as reviewDecision } from '../src/handlers/admin/review-decision.js';
import { handler as reviews } from '../src/handlers/admin/reviews.js';
import { handler as setRoute } from '../src/handlers/admin/set-route.js';
import { handler as teams } from '../src/handlers/admin/teams.js';
import { handler as tieBreak } from '../src/handlers/admin/tie-break.js';
import { handler as results } from '../src/handlers/public/results.js';
import { clearContentCache } from '../src/lib/content.js';
import { clock } from '../src/lib/clock.js';
import { rankTeams } from '../src/lib/leaderboard.js';
import type { TeamRecord } from '../src/lib/game.js';
import { parse, publicEvent, teamEvent } from './events.js';
import { attempt, contentConfig, profile, q1, q2, q4, record, routeA, stage } from './fixtures.js';

const db = mockClient(DynamoDBDocumentClient);
const NOW = new Date('2026-10-28T12:00:00.000Z');
const ID = '00000000-0000-4000-8000-0000000000aa';
const gm = (body?: unknown, pathParameters?: Record<string, string>) => {
  const event = teamEvent('gm-1', body, { 'cognito:groups': '[gamemaster]' });
  return Object.assign(event, { pathParameters });
};

/** Game table items for several teams, as a Scan returns them. */
const scanItems = (records: TeamRecord[]) =>
  records.flatMap((r) => {
    const pk = `TEAM#${r.profile.teamId}`;
    return [
      { PK: pk, SK: 'PROFILE', ...r.profile },
      ...r.stages.map((s) => ({ PK: pk, SK: `STAGE#0${s.stage}`, ...s })),
      ...r.attempts.map((a) => ({ PK: pk, SK: `ATTEMPT#0${a.stage}#${a.attemptId}`, ...a })),
    ];
  });
const finished = (teamId: string, name: string, totalActiveMs: number, totalPenaltyMs = 0) =>
  record({
    profile: profile({
      teamId,
      name,
      status: 'finished',
      currentStage: 3,
      totalActiveMs,
      totalPenaltyMs,
    }),
    stages: [],
  });

beforeEach(() => {
  db.reset();
  clearContentCache();
  clock.now = () => NOW;
  const content: Record<string, Record<string, unknown>> = {
    'CONFIG|CONFIG': contentConfig,
    'ROUTE#A|ROUTE': { questionIds: routeA },
    'ROUTE#B|ROUTE': { questionIds: ['q2', 'q1', 'q4'] },
    'QUESTION#q1|QUESTION': q1,
    'QUESTION#q2|QUESTION': q2,
    'QUESTION#q4|QUESTION': q4,
  };
  for (const [key, item] of Object.entries(content)) {
    const [PK, SK] = key.split('|');
    db.on(GetCommand, { TableName: 'content-table', Key: { PK, SK } }).resolves({ Item: item });
  }
});

describe('admin endpoints', () => {
  it('are for the game master only', async () => {
    for (const handler of [teams, reviews, publish, tieBreak]) {
      expect(parse(await handler(teamEvent('team-1', {}))).status).toBe(403);
    }
  });
});

describe('rankTeams', () => {
  it('ranks finished teams by total, equal totals by the tie-break, then the rest', () => {
    const playing = record({
      profile: profile({ teamId: 'p', name: 'Playing', currentStage: 2, totalActiveMs: 10 }),
      stages: [stage({ stage: 2, status: 'revealed', runningSince: '2026-10-28T11:59:00.000Z' })],
    });
    const ranked = rankTeams(
      [
        playing,
        finished('a', 'A', 900_000),
        finished('b', 'B', 600_000),
        finished('c', 'C', 600_000),
      ],
      ['c', 'b'],
      NOW,
    );
    expect(ranked.map((r) => [r.record.profile.teamId, r.rank, r.totalMs])).toEqual([
      ['c', 1, 600_000],
      ['b', 2, 600_000],
      ['a', 3, 900_000],
      ['p', null, 60_010],
    ]);
  });
});

describe('GET /admin/teams', () => {
  it('returns the leaderboard with live totals and acceptable wrong answers', async () => {
    db.on(GetCommand, { TableName: 'game-table' }).resolves({ Item: { status: 'live' } });
    const onText = record({
      profile: profile({ teamId: 't2', name: 'Texters', currentStage: 2, totalActiveMs: 100_000 }),
      stages: [
        stage({
          stage: 2,
          questionId: 'q2',
          status: 'revealed',
          runningSince: '2026-10-28T11:58:00.000Z',
          penaltyMs: 60_000,
        }),
      ],
      attempts: [
        attempt({
          stage: 2,
          attemptId: ID,
          questionId: 'q2',
          type: 'free_text',
          value: '1849',
          result: 'wrong',
        }),
      ],
    });
    db.on(ScanCommand).resolves({ Items: scanItems([finished('t1', 'Winners', 500_000), onText]) });
    const res = parse(await teams(gm()));
    expect(res.status).toBe(200);
    const body = adminTeamsResponseSchema.parse(res.body);
    expect(body.game).toEqual({ status: 'live', resultsPublished: false });
    expect(body.teams.map((t) => [t.name, t.rank, t.totalMs])).toEqual([
      ['Winners', 1, 500_000],
      ['Texters', null, 280_000],
    ]);
    expect(body.teams[1]).toMatchObject({
      stage: 2,
      stageCount: 3,
      stageStatus: 'revealed',
      timerRunning: true,
      wrongAnswers: [{ attemptId: ID, stage: 2, text: '1849' }],
    });
  });
});

describe('POST /admin/attempts/{teamId}/{attemptId}/accept', () => {
  const textStage = () =>
    record({
      profile: profile({ currentStage: 2 }),
      stages: [
        stage({ status: 'completed' }),
        stage({
          stage: 2,
          questionId: 'q2',
          status: 'revealed',
          activeMs: 0,
          runningSince: '2026-10-28T11:50:00.000Z',
          wrongAttempts: 2,
          penaltyMs: 120_000,
        }),
      ],
      attempts: [
        attempt({
          stage: 2,
          attemptId: ID,
          questionId: 'q2',
          type: 'free_text',
          result: 'wrong',
          submittedAt: '2026-10-28T11:52:00.000Z',
        }),
        attempt({
          stage: 2,
          attemptId: 'later',
          questionId: 'q2',
          type: 'free_text',
          result: 'wrong',
          submittedAt: '2026-10-28T11:55:00.000Z',
        }),
      ],
    });
  const given = (r: TeamRecord) => db.on(QueryCommand).resolves({ Items: scanItems([r]) });

  it('completes the stage at the answer’s time and removes its and later penalties', async () => {
    given(textStage());
    const res = parse(await acceptAnswer(gm(undefined, { teamId: 'team-1', attemptId: ID })));
    expect(res.body).toEqual({ applied: true });
    const [mark, stageUpdate, , next] =
      db.commandCalls(TransactWriteCommand)[0]!.args[0].input.TransactItems!;
    expect(mark!.Update!.ExpressionAttributeValues).toMatchObject({ ':accepted': 'gm_accepted' });
    expect(stageUpdate!.Update!.ExpressionAttributeValues).toMatchObject({
      ':outcome': 'gm_accepted',
      ':activeMs': 120_000,
      ':penaltyMs': 0,
      ':wrong': 0,
    });
    expect(next!.Put!.Item).toMatchObject({ SK: 'STAGE#03' });
  });

  it('does nothing the second time', async () => {
    const r = textStage();
    r.attempts[0]!.result = 'gm_accepted';
    given(r);
    const res = parse(await acceptAnswer(gm(undefined, { teamId: 'team-1', attemptId: ID })));
    expect(res.body).toEqual({ applied: false });
    expect(db.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });
});

describe('POST /admin/reviews/{teamId}/{attemptId}', () => {
  it('applies the decision', async () => {
    db.on(QueryCommand).resolves({
      Items: scanItems([
        {
          ...record({
            profile: profile({ currentStage: 3 }),
            stages: [stage({ stage: 3, questionId: 'q4', status: 'awaiting_review' })],
          }),
          attempts: [
            attempt({
              stage: 3,
              attemptId: ID,
              questionId: 'q4',
              type: 'video_call',
              result: 'pending',
            }),
          ],
        },
      ]),
    });
    const res = parse(
      await reviewDecision(gm({ decision: 'approved' }, { teamId: 'team-1', attemptId: ID })),
    );
    expect(res.body).toEqual({ applied: true });
    expect(db.commandCalls(TransactWriteCommand)).toHaveLength(1);
  });
});

describe('GET /admin/reviews', () => {
  it('lists the queue with question text', async () => {
    db.on(QueryCommand, { IndexName: 'GSI1' }).resolves({
      Items: [
        {
          PK: 'TEAM#team-1',
          ...attempt({
            stage: 3,
            attemptId: ID,
            questionId: 'q4',
            type: 'video_call',
            result: 'pending',
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
    const res = parse(await reviews(gm()));
    expect(res.body.reviews).toEqual([
      expect.objectContaining({
        teamName: 'The Wanderers',
        type: 'video_call',
        questionText: 'Dance!',
        photoUrl: null,
      }),
    ]);
  });
});

describe('route override, tie-break and publishing', () => {
  it('changes a route only before the start', async () => {
    db.on(UpdateCommand).rejects(
      new ConditionalCheckFailedException({ message: 'x', $metadata: {} }),
    );
    const res = parse(await setRoute(gm({ route: 'B' }, { teamId: 'team-1' })));
    expect(res.status).toBe(409);
    expect(db.commandCalls(UpdateCommand)[0]!.args[0].input.ConditionExpression).toContain(
      '#status = :registered',
    );
  });

  it('stores the tie-break order', async () => {
    db.on(UpdateCommand).resolves({});
    const res = parse(await tieBreak(gm({ teamIds: ['c', 'b'] })));
    expect(res.status).toBe(200);
    expect(db.commandCalls(UpdateCommand)[0]!.args[0].input.ExpressionAttributeValues).toEqual({
      ':ids': ['c', 'b'],
    });
  });

  it('publishes results and ends the game', async () => {
    db.on(UpdateCommand).resolves({});
    expect(parse(await publish(gm())).status).toBe(200);
    expect(
      db.commandCalls(UpdateCommand)[0]!.args[0].input.ExpressionAttributeValues,
    ).toMatchObject({
      ':finished': 'finished',
      ':true': true,
    });
  });
});

describe('GET /results', () => {
  it('is hidden until published', async () => {
    db.on(GetCommand, { TableName: 'game-table' }).resolves({ Item: { status: 'live' } });
    expect(parse(await results(publicEvent())).status).toBe(404);
  });

  it('shows ranks, names and totals once published, without teams that never started', async () => {
    db.on(GetCommand, { TableName: 'game-table' }).resolves({
      Item: { status: 'finished', resultsPublished: true },
    });
    const registered = record({
      profile: profile({ teamId: 'r', name: 'Late', status: 'registered' }),
      stages: [],
    });
    db.on(ScanCommand).resolves({
      Items: scanItems([
        finished('a', 'A', 900_000),
        finished('b', 'B', 600_000, 300_000),
        registered,
      ]),
    });
    const res = parse(await results(publicEvent()));
    expect(res.status).toBe(200);
    const body = resultsResponseSchema.parse(res.body);
    expect(body).toEqual({
      title: 'Test',
      teams: [
        { rank: 1, name: 'A', photoUrl: null, totalMs: 900_000, finished: true },
        { rank: 2, name: 'B', photoUrl: null, totalMs: 900_000, finished: true },
      ],
    });
  });
});
