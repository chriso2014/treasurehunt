// Validates a content file and loads it into the Content table, replacing what is there.
// Images referenced as content/<name> are uploaded from content/images/<name>.
//
//   npm run seed -- dev                      # content/game.private.json
//   npm run seed -- dev content/game.example.json
//   npm run seed -- --check [file]           # validate only, no AWS
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { contentImageKeys, gameContentSchema } from '@treasurehunt/shared';
import { AWS_PROFILE, AWS_REGION, parseEnv, stackOutputs } from '../../scripts/aws.js';
import { contentToItems, staleKeys, type ContentKey } from '../src/lib/content-items.js';

const repoRoot = new URL('../../', import.meta.url).pathname;
const args = process.argv.slice(2);
const checkOnly = args[0] === '--check';
const env = checkOnly ? undefined : parseEnv(args[0]);
const file = resolve(repoRoot, args[1] ?? 'content/game.private.json');

if (!existsSync(file)) {
  console.error(`${file} not found. Copy content/game.example.json to start one.`);
  process.exit(1);
}

const parsed = gameContentSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
if (!parsed.success) {
  console.error(`${basename(file)} is not valid:`);
  for (const issue of parsed.error.issues)
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}
const content = parsed.data;
const imageKeys = contentImageKeys(content);
const localImage = (key: string) =>
  resolve(repoRoot, 'content/images', key.replace(/^content\//, ''));
const missingImages = imageKeys.filter((k) => !existsSync(localImage(k)));

console.log(
  `${basename(file)} is valid: ${content.questions.length} questions, ${imageKeys.length} images.`,
);
for (const key of missingImages)
  console.warn(`  Warning: ${localImage(key)} not found, not uploaded`);
if (checkOnly || !env) process.exit(0);

process.env.AWS_PROFILE ??= AWS_PROFILE;
const outputs = stackOutputs(`treasurehunt-backend-${env}`);
const { ContentTable, AssetsBucket } = outputs;
if (!ContentTable || !AssetsBucket) {
  console.error(
    'Backend stack outputs ContentTable/AssetsBucket not found. Deploy the backend first.',
  );
  process.exit(1);
}

const db = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({ region: AWS_REGION });

const existing: ContentKey[] = [];
let startKey: Record<string, unknown> | undefined;
do {
  const page = await db.send(
    new ScanCommand({
      TableName: ContentTable,
      ProjectionExpression: 'PK, SK',
      ExclusiveStartKey: startKey,
    }),
  );
  existing.push(...((page.Items ?? []) as ContentKey[]));
  startKey = page.LastEvaluatedKey;
} while (startKey);

const items = contentToItems(content);
const requests = [
  ...items.map((Item) => ({ PutRequest: { Item } })),
  ...staleKeys(existing, items).map((Key) => ({ DeleteRequest: { Key } })),
];

// BatchWrite takes 25 requests at a time and may hand some back to retry.
for (let i = 0; i < requests.length; i += 25) {
  let batch: typeof requests | undefined = requests.slice(i, i + 25);
  for (let attempt = 0; batch && batch.length > 0; attempt++) {
    if (attempt > 5) throw new Error('DynamoDB kept returning unprocessed items');
    if (attempt > 0) await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
    const res = await db.send(new BatchWriteCommand({ RequestItems: { [ContentTable]: batch } }));
    batch = res.UnprocessedItems?.[ContentTable] as typeof requests | undefined;
  }
}

for (const key of imageKeys.filter((k) => !missingImages.includes(k))) {
  await s3.send(
    new PutObjectCommand({
      Bucket: AssetsBucket,
      Key: key,
      Body: readFileSync(localImage(key)),
      ContentType: key.endsWith('.png')
        ? 'image/png'
        : key.endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg',
    }),
  );
}

console.log(
  `Seeded ${env}: ${items.length} items written, ${requests.length - items.length} removed, ` +
    `${imageKeys.length - missingImages.length} images uploaded.`,
);
