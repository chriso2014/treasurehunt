import { ScanCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import type { RouteName } from '@treasurehunt/shared';
import { isLostRace } from './actions.js';
import { db } from './aws.js';
import { config } from './config.js';
import { getRoute } from './content.js';
import { GAME_KEY, type TeamProfile } from './game.js';
import { AppError } from './http.js';
import { startTeamItems } from './progress.js';

/**
 * Game start: registration → live, then every registered team gets its stage 1 clue.
 * Safe to run again: teams already started are skipped, so a re-run finishes a partial start.
 */
export const startGame = async (now: Date): Promise<number> => {
  try {
    await db.send(
      new UpdateCommand({
        TableName: config.gameTable,
        Key: GAME_KEY,
        UpdateExpression: 'SET #status = :live, startedAt = if_not_exists(startedAt, :now)',
        ConditionExpression: 'attribute_not_exists(#status) OR #status IN (:registration, :live)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':live': 'live',
          ':registration': 'registration',
          ':now': now.toISOString(),
        },
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new AppError('INVALID_STATE', 'The game has already finished');
    }
    throw err;
  }

  const teams: TeamProfile[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new ScanCommand({
        TableName: config.gameTable,
        FilterExpression: 'SK = :profile AND #status = :registered',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':profile': 'PROFILE', ':registered': 'registered' },
        ExclusiveStartKey: startKey,
      }),
    );
    teams.push(...((page.Items ?? []) as TeamProfile[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey);

  const firstQuestion: Partial<Record<RouteName, string>> = {};
  let started = 0;
  for (const team of teams) {
    firstQuestion[team.route] ??= (await getRoute(team.route))[0];
    const questionId = firstQuestion[team.route];
    if (!questionId) throw new Error(`Route ${team.route} has no questions`);
    try {
      await db.send(
        new TransactWriteCommand({ TransactItems: startTeamItems(team.teamId, questionId, now) }),
      );
      started++;
    } catch (err) {
      if (!isLostRace(err)) throw err;
    }
  }
  return started;
};
