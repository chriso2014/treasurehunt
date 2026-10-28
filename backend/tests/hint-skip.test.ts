import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { teamStateSchema } from '@treasurehunt/shared';
import { handler as hint } from '../src/handlers/team/hint.js';
import { handler as skip } from '../src/handlers/team/skip.js';
import { clearContentCache } from '../src/lib/content.js';
import { clock } from '../src/lib/clock.js';
import type { TeamRecord } from '../src/lib/game.js';
import { parse, teamEvent } from './events.js';
import {
  contentConfig,
  profile,
  q1,
  q2,
  q4,
  record,
  routeA,
  stage,
  teamItems,
} from './fixtures.js';

const db = mockClient(DynamoDBDocumentClient);
const NOW = new Date('2026-10-28T10:10:00.000Z');
const running = { status: 'revealed' as const, runningSince: '2026-10-28T10:08:00.000Z' };

const given = (r: TeamRecord) => {
  db.on(GetCommand, { TableName: 'game-table' }).resolves({ Item: { status: 'live' } });
  db.on(QueryCommand).resolves({ Items: teamItems(r) });
};

beforeEach(() => {
  db.reset();
  clearContentCache();
  clock.now = () => NOW;
  const content: Record<string, Record<string, unknown>> = {
    'CONFIG|CONFIG': contentConfig,
    'ROUTE#A|ROUTE': { questionIds: routeA },
    'QUESTION#q1|QUESTION': q1,
    'QUESTION#q2|QUESTION': { ...q2, penaltyMs: { hint: 120_000, skip: 600_000 } },
    'QUESTION#q4|QUESTION': q4,
  };
  for (const [key, item] of Object.entries(content)) {
    const [PK, SK] = key.split('|');
    db.on(GetCommand, { TableName: 'content-table', Key: { PK, SK } }).resolves({ Item: item });
  }
});

describe('POST /teams/me/current/hint', () => {
  it('adds the hint penalty once, conditional on the hint being unused', async () => {
    given(record({ stages: [stage(running)] }));
    const res = parse(await hint(teamEvent('team-1', { stage: 1 })));
    expect(res.status).toBe(200);
    expect(db.commandCalls(UpdateCommand)[0]!.args[0].input).toMatchObject({
      Key: { SK: 'STAGE#01' },
      ConditionExpression: '#status = :revealed AND hintUsed = :false',
      ExpressionAttributeValues: { ':p': 300_000 },
    });
  });

  it('uses a question’s own hint penalty', async () => {
    given(
      record({
        profile: profile({ currentStage: 2 }),
        stages: [stage({ status: 'completed' }), stage({ stage: 2, questionId: 'q2', ...running })],
      }),
    );
    await hint(teamEvent('team-1', { stage: 2 }));
    expect(
      db.commandCalls(UpdateCommand)[0]!.args[0].input.ExpressionAttributeValues,
    ).toMatchObject({ ':p': 120_000 });
  });

  it('shows the hint without charging again once used', async () => {
    given(record({ stages: [stage({ ...running, hintUsed: true, penaltyMs: 300_000 })] }));
    const res = parse(await hint(teamEvent('team-1', { stage: 1 })));
    expect(db.commandCalls(UpdateCommand)).toHaveLength(0);
    const state = teamStateSchema.parse(res.body);
    expect(state.current?.hint).toEqual({ text: 'Look up', imageUrl: null });
    expect(state.current?.canSkip).toBe(true);
  });

  it('is harmless when a double tap loses the race', async () => {
    given(record({ stages: [stage(running)] }));
    db.on(UpdateCommand).rejects(
      new ConditionalCheckFailedException({ message: 'x', $metadata: {} }),
    );
    expect(parse(await hint(teamEvent('team-1', { stage: 1 }))).status).toBe(200);
  });

  it('refuses before Reveal', async () => {
    given(record());
    expect(parse(await hint(teamEvent('team-1', { stage: 1 }))).status).toBe(409);
  });

  it('keeps the hint out of the state until used', async () => {
    given(record({ stages: [stage(running)] }));
    db.on(UpdateCommand).rejects(
      new ConditionalCheckFailedException({ message: 'x', $metadata: {} }),
    );
    const res = parse(await hint(teamEvent('team-1', { stage: 1 })));
    expect(res.body.current.hint).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('Look up');
  });
});

describe('POST /teams/me/current/skip', () => {
  it('needs the hint first', async () => {
    given(record({ stages: [stage(running)] }));
    const res = parse(await skip(teamEvent('team-1', { stage: 1 })));
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Use the hint before skipping');
  });

  it('adds the skip penalty, stops the timer and opens the next clue', async () => {
    given(record({ stages: [stage({ ...running, hintUsed: true, penaltyMs: 300_000 })] }));
    const res = parse(await skip(teamEvent('team-1', { stage: 1 })));
    expect(res.status).toBe(200);
    const [stageUpdate, teamUpdate, next] =
      db.commandCalls(TransactWriteCommand)[0]!.args[0].input.TransactItems!;
    expect(stageUpdate!.Update!.ExpressionAttributeValues).toMatchObject({
      ':done': 'skipped',
      ':outcome': 'skipped',
      ':activeMs': 120_000,
      ':penaltyMs': 600_000,
    });
    expect(teamUpdate!.Update!.ExpressionAttributeValues).toMatchObject({ ':penaltyMs': 600_000 });
    expect(next!.Put!.Item).toMatchObject({ SK: 'STAGE#02', status: 'clue' });
  });

  it('never skips the dance', async () => {
    given(
      record({
        profile: profile({ currentStage: 3 }),
        stages: [stage({ stage: 3, questionId: 'q4', ...running, hintUsed: true })],
      }),
    );
    const res = parse(await skip(teamEvent('team-1', { stage: 3 })));
    expect(res.status).toBe(409);
    expect(db.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('ignores a repeated skip once the team has moved on', async () => {
    given(
      record({
        profile: profile({ currentStage: 2 }),
        stages: [stage({ status: 'skipped' }), stage({ stage: 2, questionId: 'q2' })],
      }),
    );
    const res = parse(await skip(teamEvent('team-1', { stage: 1 })));
    expect(res.status).toBe(200);
    expect(res.body.current.stage).toBe(2);
    expect(db.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });
});
