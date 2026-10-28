import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { skipRequestSchema } from '@treasurehunt/shared';
import { isLostRace, loadForAction } from '../../lib/actions.js';
import { teamIdFrom, type AuthedEvent } from '../../lib/auth.js';
import { db } from '../../lib/aws.js';
import { clock } from '../../lib/clock.js';
import { getContentConfig, getQuestion, getRoute, penaltyFor } from '../../lib/content.js';
import { AppError, json, parseBody, route } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';
import { completeStageItems } from '../../lib/progress.js';
import { loadState } from '../../lib/state.js';

// POST /teams/me/current/skip { stage }. Only after the hint, never on the final dance:
// adds the skip penalty, stops the timer and opens the next clue.
export const handler = route(async (event: AuthedEvent) => {
  const teamId = teamIdFrom(event);
  const { stage } = parseBody(event, skipRequestSchema);
  const ctx = await loadForAction(teamId, stage);

  if (ctx) {
    const question = await getQuestion(ctx.stage.questionId);
    if (question.type === 'video_call')
      throw new AppError('INVALID_STATE', 'The dance can’t be skipped');
    if (!ctx.stage.hintUsed) throw new AppError('INVALID_STATE', 'Use the hint before skipping');
    if (ctx.stage.status !== 'revealed') {
      throw new AppError('INVALID_STATE', 'This question can’t be skipped right now');
    }

    const [routeIds, contentConfig] = await Promise.all([
      getRoute(ctx.record.profile.route),
      getContentConfig(),
    ]);
    try {
      await db.send(
        new TransactWriteCommand({
          TransactItems: completeStageItems({
            profile: ctx.record.profile,
            stage: ctx.stage,
            nextQuestionId: routeIds[ctx.stage.stage],
            outcome: 'skipped',
            extraPenaltyMs: penaltyFor('skip', question, contentConfig),
            now: clock.now(),
          }),
        }),
      );
      logger.info('skipped', { teamId, stage, action: 'skip' });
    } catch (err) {
      if (!isLostRace(err)) throw err;
    }
  }
  return json(200, await loadState(teamId));
});
