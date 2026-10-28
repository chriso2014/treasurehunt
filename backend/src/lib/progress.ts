import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { config } from './config.js';
import { stageKey, teamKey, type StageItem, type TeamProfile } from './game.js';
import { paused } from './timer.js';

// Stage transitions as DynamoDB writes (docs/04-data-model.md "Stage transitions").
// Every write is conditional on the state it was computed from, so a retry or a double tap
// fails the condition instead of applying twice.

type TransactItems = NonNullable<TransactWriteCommandInput['TransactItems']>;

export const newStage = (stage: number, questionId: string, now: Date): StageItem => ({
  stage,
  questionId,
  status: 'clue',
  clueShownAt: now.toISOString(),
  activeMs: 0,
  wrongAttempts: 0,
  declines: 0,
  hintUsed: false,
  skipped: false,
  penaltyMs: 0,
});

/** Starts a registered team on stage 1 (game start). */
export const startTeamItems = (
  teamId: string,
  firstQuestionId: string,
  now: Date,
): TransactItems => [
  {
    Update: {
      TableName: config.gameTable,
      Key: teamKey(teamId),
      UpdateExpression: 'SET #status = :playing, currentStage = :one',
      ConditionExpression: '#status = :registered',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':playing': 'playing', ':registered': 'registered', ':one': 1 },
    },
  },
  {
    Put: {
      TableName: config.gameTable,
      Item: { ...stageKey(teamId, 1), ...newStage(1, firstQuestionId, now) },
      ConditionExpression: 'attribute_not_exists(PK)',
    },
  },
];

export type StageOutcome = NonNullable<StageItem['outcome']>;

/**
 * Finishes the current stage: stops its timer, adds its time and penalties to the team totals,
 * and either opens the next stage's clue or finishes the team.
 * `extraPenaltyMs` is a penalty applied in the same step (e.g. skip or a declined dance).
 */
export const completeStageItems = (args: {
  profile: TeamProfile;
  stage: StageItem;
  nextQuestionId: string | undefined;
  outcome: StageOutcome;
  extraPenaltyMs?: number;
  /** When the timer stopped, if earlier than now (a GM-accepted answer stops at its submission). */
  stopAt?: Date;
  /** Corrected wrong-answer count (a GM-accepted answer removes its own and later ones). */
  wrongAttempts?: number;
  now: Date;
}): TransactItems => {
  const { profile, stage, nextQuestionId, outcome, now } = args;
  const extraPenaltyMs = args.extraPenaltyMs ?? 0;
  const { activeMs } = paused(stage, args.stopAt ?? now);
  const wrongAttempts = args.wrongAttempts ?? stage.wrongAttempts;
  const penaltyMs = stage.penaltyMs + extraPenaltyMs;
  const nowIso = now.toISOString();
  const finished = nextQuestionId === undefined;

  const items: TransactItems = [
    {
      Update: {
        TableName: config.gameTable,
        Key: stageKey(profile.teamId, stage.stage),
        UpdateExpression:
          'SET #status = :done, completedAt = :now, activeMs = :activeMs, penaltyMs = :penaltyMs, ' +
          'outcome = :outcome, skipped = :skipped, wrongAttempts = :wrong REMOVE runningSince',
        ConditionExpression: '#status = :expected AND penaltyMs = :oldPenalty',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':done': outcome === 'skipped' ? 'skipped' : 'completed',
          ':now': nowIso,
          ':activeMs': activeMs,
          ':penaltyMs': penaltyMs,
          ':outcome': outcome,
          ':skipped': outcome === 'skipped',
          ':wrong': wrongAttempts,
          ':expected': stage.status,
          ':oldPenalty': stage.penaltyMs,
        },
      },
    },
    {
      Update: {
        TableName: config.gameTable,
        Key: teamKey(profile.teamId),
        UpdateExpression: finished
          ? 'SET totalActiveMs = totalActiveMs + :activeMs, totalPenaltyMs = totalPenaltyMs + :penaltyMs, ' +
            '#status = :finished, finishedAt = :now'
          : 'SET totalActiveMs = totalActiveMs + :activeMs, totalPenaltyMs = totalPenaltyMs + :penaltyMs, ' +
            'currentStage = :next',
        ConditionExpression: 'currentStage = :current AND #status = :playing',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':activeMs': activeMs,
          ':penaltyMs': penaltyMs,
          ':current': stage.stage,
          ':playing': 'playing',
          ...(finished
            ? { ':finished': 'finished', ':now': nowIso }
            : { ':next': stage.stage + 1 }),
        },
      },
    },
  ];

  if (nextQuestionId !== undefined) {
    items.push({
      Put: {
        TableName: config.gameTable,
        Item: {
          ...stageKey(profile.teamId, stage.stage + 1),
          ...newStage(stage.stage + 1, nextQuestionId, now),
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    });
  }
  return items;
};
