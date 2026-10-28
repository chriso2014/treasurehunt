import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { hintRequestSchema } from '@treasurehunt/shared';
import { isLostRace, loadForAction } from '../../lib/actions.js';
import { teamIdFrom, type AuthedEvent } from '../../lib/auth.js';
import { db } from '../../lib/aws.js';
import { config } from '../../lib/config.js';
import { getContentConfig, getQuestion, penaltyFor } from '../../lib/content.js';
import { stageKey } from '../../lib/game.js';
import { AppError, json, parseBody, route } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';
import { loadState } from '../../lib/state.js';

// POST /teams/me/current/hint { stage }. Adds the hint penalty once and reveals the hint.
// Asking again is harmless: the penalty is only added while hintUsed is false.
export const handler = route(async (event: AuthedEvent) => {
  const teamId = teamIdFrom(event);
  const { stage } = parseBody(event, hintRequestSchema);
  const ctx = await loadForAction(teamId, stage);

  if (ctx && !ctx.stage.hintUsed) {
    if (ctx.stage.status !== 'revealed') {
      throw new AppError('INVALID_STATE', 'Reveal the question before asking for the hint');
    }
    const question = await getQuestion(ctx.stage.questionId);
    const penalty = penaltyFor('hint', question, await getContentConfig());
    try {
      await db.send(
        new UpdateCommand({
          TableName: config.gameTable,
          Key: stageKey(teamId, stage),
          UpdateExpression: 'SET hintUsed = :true, penaltyMs = penaltyMs + :p',
          ConditionExpression: '#status = :revealed AND hintUsed = :false',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':true': true,
            ':false': false,
            ':p': penalty,
            ':revealed': 'revealed',
          },
        }),
      );
      logger.info('hint used', { teamId, stage, action: 'hint' });
    } catch (err) {
      if (!isLostRace(err)) throw err;
    }
  }
  return json(200, await loadState(teamId));
});
