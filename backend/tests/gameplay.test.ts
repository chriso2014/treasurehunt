import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { answerResponseSchema, teamStateSchema } from '@treasurehunt/shared';
import { handler as reveal } from '../src/handlers/team/reveal.js';
import { handler as answer } from '../src/handlers/team/answer.js';
import { handler as state } from '../src/handlers/team/state.js';
import { handler as startGame } from '../src/handlers/admin/start-game.js';
import { clearContentCache } from '../src/lib/content.js';
import { clock } from '../src/lib/clock.js';
import type { TeamRecord } from '../src/lib/game.js';
import { parse, teamEvent } from './events.js';
import {
  attempt,
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
const ATTEMPT = '11111111-1111-4111-8111-111111111111';

const given = (r: TeamRecord, gameStatus = 'live') => {
  db.on(GetCommand, { TableName: 'game-table', Key: { PK: 'GAME', SK: 'STATE' } }).resolves({
    Item: { status: gameStatus },
  });
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
    'QUESTION#q2|QUESTION': q2,
    'QUESTION#q4|QUESTION': q4,
  };
  for (const [key, item] of Object.entries(content)) {
    const [PK, SK] = key.split('|');
    db.on(GetCommand, { TableName: 'content-table', Key: { PK, SK } }).resolves({ Item: item });
  }
});

const transactItems = () => db.commandCalls(TransactWriteCommand)[0]!.args[0].input.TransactItems!;

describe('GET /teams/me/state', () => {
  it('returns the caller’s state from their own partition only', async () => {
    given(record());
    const res = parse(await state(teamEvent('team-1')));
    expect(teamStateSchema.parse(res.body).current?.status).toBe('clue');
    expect(db.commandCalls(QueryCommand)[0]!.args[0].input.ExpressionAttributeValues).toEqual({
      ':pk': 'TEAM#team-1',
    });
  });

  it('returns 404 for a token with no team (e.g. the game master)', async () => {
    db.on(GetCommand, { TableName: 'game-table' }).resolves({});
    db.on(QueryCommand).resolves({ Items: [] });
    expect(parse(await state(teamEvent('gm'))).status).toBe(404);
  });
});

describe('POST /teams/me/current/reveal', () => {
  it('starts the timer on a clue', async () => {
    given(record());
    const res = parse(await reveal(teamEvent('team-1', { stage: 1 })));
    expect(res.status).toBe(200);
    expect(db.commandCalls(UpdateCommand)[0]!.args[0].input).toMatchObject({
      Key: { PK: 'TEAM#team-1', SK: 'STAGE#01' },
      ConditionExpression: '#status = :clue',
      ExpressionAttributeValues: { ':now': NOW.toISOString() },
    });
  });

  it('is harmless when tapped twice', async () => {
    given(record({ stages: [stage({ status: 'revealed', runningSince: NOW.toISOString() })] }));
    const res = parse(await reveal(teamEvent('team-1', { stage: 1 })));
    expect(res.status).toBe(200);
    expect(db.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it('refuses before the game is live', async () => {
    given(record({ profile: profile({ status: 'registered' }), stages: [] }), 'registration');
    const res = parse(await reveal(teamEvent('team-1', { stage: 1 })));
    expect(res.body.error.code).toBe('GAME_NOT_LIVE');
  });

  it('refuses a stage the team has not reached', async () => {
    given(record());
    const res = parse(await reveal(teamEvent('team-1', { stage: 2 })));
    expect(res.status).toBe(409);
  });
});

describe('POST /teams/me/current/answer', () => {
  const revealedAt = '2026-10-28T10:08:00.000Z';
  const revealed = () =>
    record({ stages: [stage({ status: 'revealed', runningSince: revealedAt, revealedAt })] });

  it('adds the wrong-answer penalty and logs the attempt', async () => {
    given(revealed());
    const res = parse(
      await answer(teamEvent('team-1', { stage: 1, attemptId: ATTEMPT, optionId: 'a' })),
    );
    expect(answerResponseSchema.parse(res.body).correct).toBe(false);
    const [put, update] = transactItems();
    expect(put!.Put).toMatchObject({
      Item: { SK: `ATTEMPT#01#${ATTEMPT}`, result: 'wrong', value: 'a' },
      ConditionExpression: 'attribute_not_exists(PK)',
    });
    expect(update!.Update).toMatchObject({
      Key: { SK: 'STAGE#01' },
      ExpressionAttributeValues: { ':p': 300_000 },
      ConditionExpression: '#status = :revealed',
    });
  });

  it('uses a question’s own penalty when set', async () => {
    given(
      record({
        profile: profile({ currentStage: 2 }),
        stages: [
          stage({ status: 'completed' }),
          stage({ stage: 2, questionId: 'q2', status: 'revealed', runningSince: revealedAt }),
        ],
      }),
    );
    await answer(teamEvent('team-1', { stage: 2, attemptId: ATTEMPT, text: '1900' }));
    expect(transactItems()[1]!.Update!.ExpressionAttributeValues).toMatchObject({ ':p': 60_000 });
  });

  it('completes the stage on a correct answer and opens the next clue', async () => {
    given(revealed());
    const res = parse(
      await answer(teamEvent('team-1', { stage: 1, attemptId: ATTEMPT, optionId: 'b' })),
    );
    expect(res.body.correct).toBe(true);
    const [, stageUpdate, teamUpdate, nextStage] = transactItems();
    expect(stageUpdate!.Update!.ExpressionAttributeValues).toMatchObject({
      ':done': 'completed',
      ':activeMs': 120_000,
      ':outcome': 'correct',
      ':expected': 'revealed',
    });
    expect(teamUpdate!.Update!.ExpressionAttributeValues).toMatchObject({
      ':activeMs': 120_000,
      ':penaltyMs': 0,
      ':current': 1,
      ':next': 2,
    });
    expect(nextStage!.Put!.Item).toMatchObject({
      SK: 'STAGE#02',
      questionId: 'q2',
      status: 'clue',
    });
  });

  it('accepts lenient free text', async () => {
    given(
      record({
        profile: profile({ currentStage: 2 }),
        stages: [
          stage({ status: 'completed' }),
          stage({ stage: 2, questionId: 'q2', status: 'revealed', runningSince: revealedAt }),
        ],
      }),
    );
    const res = parse(
      await answer(teamEvent('team-1', { stage: 2, attemptId: ATTEMPT, text: ' 1850 ' })),
    );
    expect(res.body.correct).toBe(true);
  });

  it('answers a retried submission from the stored attempt without writing again', async () => {
    given({ ...revealed(), attempts: [attempt({ attemptId: ATTEMPT })] });
    const res = parse(
      await answer(teamEvent('team-1', { stage: 1, attemptId: ATTEMPT, optionId: 'a' })),
    );
    expect(res.body.correct).toBe(false);
    expect(db.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('ignores a late retry for a stage the team has finished', async () => {
    given(
      record({
        profile: profile({ currentStage: 2 }),
        stages: [stage({ status: 'completed' }), stage({ stage: 2, questionId: 'q2' })],
      }),
    );
    const res = parse(
      await answer(teamEvent('team-1', { stage: 1, attemptId: ATTEMPT, optionId: 'b' })),
    );
    expect(res.body.correct).toBeNull();
    expect(res.body.state.current.stage).toBe(2);
    expect(db.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('returns the current state when a concurrent request wins the race', async () => {
    given(revealed());
    db.on(TransactWriteCommand).rejects(
      new TransactionCanceledException({ message: 'cancelled', $metadata: {} }),
    );
    const res = parse(
      await answer(teamEvent('team-1', { stage: 1, attemptId: ATTEMPT, optionId: 'b' })),
    );
    expect(res.status).toBe(200);
    expect(res.body.correct).toBeNull();
  });

  it('answers a double tap that lost the race from the stored attempt', async () => {
    given(revealed());
    db.on(QueryCommand)
      .resolvesOnce({ Items: teamItems(revealed()) })
      .resolves({
        Items: teamItems({ ...revealed(), attempts: [attempt({ attemptId: ATTEMPT })] }),
      });
    db.on(TransactWriteCommand).rejects(
      new TransactionCanceledException({ message: 'cancelled', $metadata: {} }),
    );
    const res = parse(
      await answer(teamEvent('team-1', { stage: 1, attemptId: ATTEMPT, optionId: 'a' })),
    );
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(false);
  });

  it('refuses an answer before Reveal', async () => {
    given(record());
    const res = parse(
      await answer(teamEvent('team-1', { stage: 1, attemptId: ATTEMPT, optionId: 'b' })),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });

  it('refuses the wrong kind of answer', async () => {
    given(revealed());
    const res = parse(
      await answer(teamEvent('team-1', { stage: 1, attemptId: ATTEMPT, text: 'Blue' })),
    );
    expect(res.status).toBe(400);
  });

  it('requires an attempt id', async () => {
    given(revealed());
    const res = parse(await answer(teamEvent('team-1', { stage: 1, optionId: 'b' })));
    expect(res.status).toBe(400);
  });
});

describe('POST /admin/game/start', () => {
  const gm = (sub = 'gm') => teamEvent(sub, undefined, { 'cognito:groups': '[gamemaster]' });

  it('is game master only', async () => {
    const res = parse(await startGame(teamEvent('team-1')));
    expect(res.status).toBe(403);
    expect(db.calls()).toHaveLength(0);
  });

  it('goes live and gives each registered team its first clue', async () => {
    db.on(ScanCommand).resolves({
      Items: [
        { ...profile({ status: 'registered' }) },
        { ...profile({ teamId: 'team-2', status: 'registered' }) },
      ],
    });
    const res = parse(await startGame(gm()));
    expect(res.body).toEqual({ status: 'live', teamsStarted: 2 });
    expect(
      db.commandCalls(UpdateCommand)[0]!.args[0].input.ExpressionAttributeValues,
    ).toMatchObject({
      ':live': 'live',
    });
    const firstTeam = db.commandCalls(TransactWriteCommand)[0]!.args[0].input.TransactItems!;
    expect(firstTeam[1]!.Put!.Item).toMatchObject({
      SK: 'STAGE#01',
      questionId: 'q1',
      status: 'clue',
    });
  });

  it('can be run again: already started teams are skipped', async () => {
    db.on(ScanCommand).resolves({ Items: [profile({ status: 'registered' })] });
    db.on(TransactWriteCommand).rejects(
      new TransactionCanceledException({ message: 'cancelled', $metadata: {} }),
    );
    const res = parse(await startGame(gm()));
    expect(res.body.teamsStarted).toBe(0);
  });
});
