import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3 } from './aws.js';
import { config } from './config.js';

/** Short-lived (15 min) URL for viewing a private image. */
export const viewUrl = (key: string): Promise<string> =>
  getSignedUrl(s3, new GetObjectCommand({ Bucket: config.assetsBucket, Key: key }), {
    expiresIn: 15 * 60,
  });
