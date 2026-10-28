import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { RouteName } from '@treasurehunt/shared';
import { isLostRace } from './actions.js';
import { db } from './aws.js';
import { config } from './config.js';
import { getContentConfig, getQuestion, getRoute, penaltyFor } from './content.js';
import { attemptKey, currentStageOf, GAME_KEY, loadTeam, teamKey } from './game.js';
import { AppError } from './http.js';
import { completeStageItems } from './progress.js';

// Game master writes other than start and review (those are lib/start.ts and lib/review.ts).
// Each is conditional, so a repeated tap returns false instead of acting twice.

/**
 * Accepts a wrong text answer (docs/02 "Text answers"): the stage completes as `gm_accepted`,
 * the timer stops at that answer's submission and the penalties for it and any later wrong
 * answers on the stage are removed.
 */
export const acceptAnswer = async (args: {
  teamId: string;
  attemptId: string;
  now: Date;
}): Promise<boolean> => {
  const { teamId, attemptId, now } = args;
  const record = await loadTeam(teamId);
  const attempt = record.attempts.find((a) => a.attemptId === attemptId);
  if (!attempt || attempt.type !== 'free_text') throw new AppError('NOT_FOUND', 'Answer not found');
  if (attempt.result === 'gm_accepted') return false;
  const stage = currentStageOf(record);
  if (
    attempt.result !== 'wrong' ||
    record.profile.status !== 'playing' ||
    !stage ||
    stage.stage !== attempt.stage ||
    stage.status !== 'revealed'
  ) {
    throw new AppError('INVALID_STATE', 'The team has already moved on from that question');
  }

  const question = await getQuestion(stage.questionId);
  const [routeIds, contentConfig] = await Promise.all([
    getRoute(record.profile.route),
    getContentConfig(),
  ]);
  const wrongFromHere = record.attempts.filter(
    (a) => a.stage === stage.stage && a.result === 'wrong' && a.submittedAt >= attempt.submittedAt,
  ).length;
  const stopAt = new Date(attempt.submittedAt);

  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: config.gameTable,
              Key: attemptKey(teamId, stage.stage, attemptId),
              UpdateExpression: 'SET #result = :accepted, reviewedAt = :now',
              ConditionExpression: '#result = :wrong',
              ExpressionAttributeNames: { '#result': 'result' },
              ExpressionAttributeValues: {
                ':accepted': 'gm_accepted',
                ':wrong': 'wrong',
                ':now': now.toISOString(),
              },
            },
          },
          ...completeStageItems({
            profile: record.profile,
            stage,
            nextQuestionId: routeIds[stage.stage],
            outcome: 'gm_accepted',
            extraPenaltyMs: -wrongFromHere * penaltyFor('wrong', question, contentConfig),
            wrongAttempts: stage.wrongAttempts - wrongFromHere,
            stopAt: stopAt < now ? stopAt : now,
            now,
          }),
        ],
      }),
    );
  } catch (err) {
    if (!isLostRace(err)) throw err;
    return false;
  }
  return true;
};

const conditional = async (command: UpdateCommand, message: string) => {
  try {
    await db.send(command);
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException)
      throw new AppError('INVALID_STATE', message);
    throw err;
  }
};

/** Route override, before the game starts only. */
export const setRoute = async (teamId: string, route: RouteName): Promise<void> => {
  await conditional(
    new UpdateCommand({
      TableName: config.gameTable,
      Key: teamKey(teamId),
      UpdateExpression: 'SET #route = :route',
      ConditionExpression: 'attribute_exists(PK) AND #status = :registered',
      ExpressionAttributeNames: { '#route': 'route', '#status': 'status' },
      ExpressionAttributeValues: { ':route': route, ':registered': 'registered' },
    }),
    'Routes can only be changed before the game starts',
  );
};

/** The GM's order for teams with equal totals. */
export const setTieBreak = async (teamIds: string[]): Promise<void> => {
  await conditional(
    new UpdateCommand({
      TableName: config.gameTable,
      Key: GAME_KEY,
      UpdateExpression: 'SET tieBreakOrder = :ids',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeValues: { ':ids': teamIds },
    }),
    'No game yet',
  );
};

/** Ends the game and makes /results public. Repeating it is harmless. */
export const publishResults = async (now: Date): Promise<void> => {
  await conditional(
    new UpdateCommand({
      TableName: config.gameTable,
      Key: GAME_KEY,
      UpdateExpression:
        'SET #status = :finished, resultsPublished = :true, publishedAt = if_not_exists(publishedAt, :now)',
      ConditionExpression: '#status IN (:live, :finished)',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':finished': 'finished',
        ':true': true,
        ':now': now.toISOString(),
        ':live': 'live',
      },
    }),
    'Start the game before publishing results',
  );
};
