import { HeadObjectCommand, NotFound } from '@aws-sdk/client-s3';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { submissionRequestSchema } from '@treasurehunt/shared';
import { isLostRace, loadForAction } from '../../lib/actions.js';
import { teamIdFrom, type AuthedEvent } from '../../lib/auth.js';
import { db, s3 } from '../../lib/aws.js';
import { clock } from '../../lib/clock.js';
import { config } from '../../lib/config.js';
import { getQuestion } from '../../lib/content.js';
import { submissionPhotoKey, type AttemptItem } from '../../lib/game.js';
import { AppError, json, parseBody, route } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';
import { loadState } from '../../lib/state.js';
import { pauseForReviewItems } from '../../lib/submissions.js';

// POST /teams/me/current/photo { stage, attemptId }, after the upload. Pauses the timer and
// queues the photo for the GM. A retry with the same attemptId is applied once.
export const handler = route(async (event: AuthedEvent) => {
  const teamId = teamIdFrom(event);
  const { stage, attemptId } = parseBody(event, submissionRequestSchema);
  const ctx = await loadForAction(teamId, stage);
  const repeat = ctx?.record.attempts.some((a) => a.attemptId === attemptId);

  if (ctx && !repeat && ctx.stage.status !== 'awaiting_review') {
    if (ctx.stage.status !== 'revealed') throw new AppError('INVALID_STATE', 'Reveal first');
    const question = await getQuestion(ctx.stage.questionId);
    if (question.type !== 'photo') {
      throw new AppError('INVALID_STATE', 'This question doesn’t take a photo');
    }
    const photoKey = submissionPhotoKey(teamId, stage, attemptId);
    try {
      await s3.send(new HeadObjectCommand({ Bucket: config.assetsBucket, Key: photoKey }));
    } catch (err) {
      if (err instanceof NotFound) throw new AppError('VALIDATION', 'Photo not uploaded yet');
      throw err;
    }

    const now = clock.now();
    const attempt: AttemptItem = {
      stage,
      attemptId,
      questionId: question.id,
      type: 'photo',
      submittedAt: now.toISOString(),
      photoKey,
      result: 'pending',
    };
    try {
      await db.send(
        new TransactWriteCommand({
          TransactItems: pauseForReviewItems({ teamId, stage: ctx.stage, attempt, now }),
        }),
      );
      logger.info('photo submitted', { teamId, stage, action: 'photo' });
    } catch (err) {
      if (!isLostRace(err)) throw err;
    }
  }
  return json(200, await loadState(teamId));
});
