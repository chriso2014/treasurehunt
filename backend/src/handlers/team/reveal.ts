import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { revealRequestSchema } from '@treasurehunt/shared';
import { isLostRace, loadForAction } from '../../lib/actions.js';
import { teamIdFrom, type AuthedEvent } from '../../lib/auth.js';
import { db } from '../../lib/aws.js';
import { nowIso } from '../../lib/clock.js';
import { config } from '../../lib/config.js';
import { stageKey } from '../../lib/game.js';
import { AppError, json, parseBody, route } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';
import { loadState } from '../../lib/state.js';

// POST /teams/me/current/reveal { stage }. clue → revealed; the question timer starts now.
export const handler = route(async (event: AuthedEvent) => {
  const teamId = teamIdFrom(event);
  const { stage } = parseBody(event, revealRequestSchema);
  const ctx = await loadForAction(teamId, stage);

  if (ctx?.stage.status === 'clue') {
    const now = nowIso();
    try {
      await db.send(
        new UpdateCommand({
          TableName: config.gameTable,
          Key: stageKey(teamId, stage),
          UpdateExpression: 'SET #status = :revealed, revealedAt = :now, runningSince = :now',
          ConditionExpression: '#status = :clue',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':revealed': 'revealed', ':clue': 'clue', ':now': now },
        }),
      );
      logger.info('revealed', { teamId, stage, action: 'reveal' });
    } catch (err) {
      if (!isLostRace(err)) throw err;
    }
  } else if (ctx && ctx.stage.status !== 'revealed' && ctx.stage.status !== 'awaiting_review') {
    throw new AppError('INVALID_STATE', 'Nothing to reveal');
  }
  // Already revealed (double tap) or moved on: just return the current state.
  return json(200, await loadState(teamId));
});
