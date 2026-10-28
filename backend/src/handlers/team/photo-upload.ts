import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { MAX_PHOTO_BYTES, teamPhotoKey, type PhotoUploadResponse } from '@treasurehunt/shared';
import { teamIdFrom, type AuthedEvent } from '../../lib/auth.js';
import { s3 } from '../../lib/aws.js';
import { config } from '../../lib/config.js';
import { getGameStatus, getTeam } from '../../lib/game.js';
import { AppError, json, route } from '../../lib/http.js';

// POST /teams/me/photo-upload. Pre-signed POST for the team photo (retake allowed until the start).
export const handler = route(async (event: AuthedEvent) => {
  const teamId = teamIdFrom(event);
  const [team, gameStatus] = await Promise.all([getTeam(teamId), getGameStatus()]);
  if (team.status !== 'registered' || gameStatus !== 'registration') {
    throw new AppError(
      'INVALID_STATE',
      'The team photo can only be changed before the game starts',
    );
  }

  const key = teamPhotoKey(teamId);
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
