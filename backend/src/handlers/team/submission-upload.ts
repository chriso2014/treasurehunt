import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import {
  MAX_PHOTO_BYTES,
  submissionRequestSchema,
  type PhotoUploadResponse,
} from '@treasurehunt/shared';
import { loadForAction } from '../../lib/actions.js';
import { teamIdFrom, type AuthedEvent } from '../../lib/auth.js';
import { s3 } from '../../lib/aws.js';
import { config } from '../../lib/config.js';
import { getQuestion } from '../../lib/content.js';
import { submissionPhotoKey } from '../../lib/game.js';
import { AppError, json, parseBody, route } from '../../lib/http.js';

// POST /teams/me/current/photo-upload { stage, attemptId }. Pre-signed POST for a photo answer.
// The key comes from the caller's team, stage and attemptId, never from the request.
export const handler = route(async (event: AuthedEvent) => {
  const teamId = teamIdFrom(event);
  const { stage, attemptId } = parseBody(event, submissionRequestSchema);
  const ctx = await loadForAction(teamId, stage);
  if (!ctx || ctx.stage.status !== 'revealed') {
    throw new AppError('INVALID_STATE', 'This question isn’t waiting for a photo');
  }
  if ((await getQuestion(ctx.stage.questionId)).type !== 'photo') {
    throw new AppError('INVALID_STATE', 'This question doesn’t take a photo');
  }

  const key = submissionPhotoKey(teamId, stage, attemptId);
  const { url, fields } = await createPresignedPost(s3, {
    Bucket: config.assetsBucket,
    Key: key,
    Conditions: [
      ['content-length-range', 1, MAX_PHOTO_BYTES],
      ['eq', '$Content-Type', 'image/jpeg'],
    ],
    Fields: { 'Content-Type': 'image/jpeg' },
    Expires: 5 * 60,
  });
  const body: PhotoUploadResponse = { url, fields, key };
  return json(200, body);
});
