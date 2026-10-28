import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { submissionRequestSchema } from '@treasurehunt/shared';
import { isLostRace, loadForAction } from '../../lib/actions.js';
import { teamIdFrom, type AuthedEvent } from '../../lib/auth.js';
import { db } from '../../lib/aws.js';
import { clock } from '../../lib/clock.js';
import { getQuestion } from '../../lib/content.js';
import type { AttemptItem } from '../../lib/game.js';
import { AppError, json, parseBody, route } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';
import { loadState } from '../../lib/state.js';
import { pauseForReviewItems } from '../../lib/submissions.js';

// POST /teams/me/current/video-call { stage, attemptId }. The team is ready to dance: pause the
// timer (waiting for the GM to pick up costs nothing) and queue the call for the GM's decision.
// The returned state carries the WhatsApp link.
export const handler = route(async (event: AuthedEvent) => {
  const teamId = teamIdFrom(event);
  const { stage, attemptId } = parseBody(event, submissionRequestSchema);
  const ctx = await loadForAction(teamId, stage);

  if (ctx && ctx.stage.status !== 'awaiting_review') {
    if (ctx.stage.status !== 'revealed') throw new AppError('INVALID_STATE', 'Reveal first');
    const question = await getQuestion(ctx.stage.questionId);
    if (question.type !== 'video_call') {
      throw new AppError('INVALID_STATE', 'This question isn’t the dance');
    }
    const now = clock.now();
    const attempt: AttemptItem = {
      stage,
      attemptId,
      questionId: question.id,
      type: 'video_call',
      submittedAt: now.toISOString(),
      result: 'pending',
    };
    try {
      await db.send(
        new TransactWriteCommand({
          TransactItems: pauseForReviewItems({ teamId, stage: ctx.stage, attempt, now }),
        }),
      );
      logger.info('dance call requested', { teamId, stage, action: 'video-call' });
    } catch (err) {
      if (!isLostRace(err)) throw err;
    }
  }
  return json(200, await loadState(teamId));
});
