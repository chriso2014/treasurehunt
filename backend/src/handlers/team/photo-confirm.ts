import { HeadObjectCommand, NotFound } from '@aws-sdk/client-s3';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  photoConfirmRequestSchema,
  teamPhotoKey,
  type PhotoConfirmResponse,
} from '@treasurehunt/shared';
import { teamIdFrom, type AuthedEvent } from '../../lib/auth.js';
import { db, s3 } from '../../lib/aws.js';
import { config } from '../../lib/config.js';
import { teamKey } from '../../lib/game.js';
import { AppError, json, parseBody, route } from '../../lib/http.js';
import { viewUrl } from '../../lib/s3.js';

// POST /teams/me/photo-confirm { key }. Checks the upload landed and stores it on the team.
export const handler = route(async (event: AuthedEvent) => {
  const teamId = teamIdFrom(event);
  const { key } = parseBody(event, photoConfirmRequestSchema);
  if (key !== teamPhotoKey(teamId)) throw new AppError('VALIDATION', 'Unexpected photo key');

  try {
    await s3.send(new HeadObjectCommand({ Bucket: config.assetsBucket, Key: key }));
  } catch (err) {
    if (err instanceof NotFound) throw new AppError('VALIDATION', 'Photo not uploaded yet');
    throw err;
  }

  try {
    await db.send(
      new UpdateCommand({
        TableName: config.gameTable,
        Key: teamKey(teamId),
        UpdateExpression: 'SET photoKey = :key',
        ConditionExpression: 'attribute_exists(PK) AND #status = :registered',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':key': key, ':registered': 'registered' },
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new AppError(
        'INVALID_STATE',
        'The team photo can only be changed before the game starts',
      );
    }
    throw err;
  }

  const body: PhotoConfirmResponse = { photoUrl: await viewUrl(key) };
  return json(200, body);
});
