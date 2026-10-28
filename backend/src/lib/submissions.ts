import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { config } from './config.js';
import { attemptKey, REVIEW_PENDING, stageKey, type AttemptItem, type StageItem } from './game.js';
import { paused } from './timer.js';

type TransactItems = NonNullable<TransactWriteCommandInput['TransactItems']>;

/**
 * A photo or dance submission: stores a pending attempt (which puts it in the GM's review queue,
 * GSI1) and pauses the stage timer while the GM decides (docs/03 "GM review flow").
 */
export const pauseForReviewItems = (args: {
  teamId: string;
  stage: StageItem;
  attempt: AttemptItem;
  now: Date;
}): TransactItems => {
  const { teamId, stage, attempt, now } = args;
  return [
    {
      Put: {
        TableName: config.gameTable,
        Item: {
          ...attemptKey(teamId, stage.stage, attempt.attemptId),
          ...attempt,
          GSI1PK: REVIEW_PENDING,
          GSI1SK: attempt.submittedAt,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
    {
      Update: {
        TableName: config.gameTable,
        Key: stageKey(teamId, stage.stage),
        UpdateExpression: 'SET #status = :awaiting, activeMs = :activeMs REMOVE runningSince',
        ConditionExpression: '#status = :revealed AND runningSince = :runningSince',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':awaiting': 'awaiting_review',
          ':activeMs': paused(stage, now).activeMs,
          ':revealed': 'revealed',
          ':runningSince': stage.runningSince,
        },
      },
    },
  ];
};
