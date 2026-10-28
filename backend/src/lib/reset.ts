import {
  AdminDeleteUserCommand,
  ListUsersCommand,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BatchWriteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { cognito, db, s3 } from './aws.js';
import { config } from './config.js';
import { GAME_KEY } from './game.js';

// Puts an env back to the start: no teams, game in registration (scripts/reset.ts, e2e).
// Content, the content images and game master logins are kept.

export type ResetSummary = { teams: number; items: number; logins: number; photos: number };

type Key = { PK: string; SK: string };

const gameKeys = async (): Promise<Key[]> => {
  const keys: Key[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new ScanCommand({
        TableName: config.gameTable,
        ProjectionExpression: 'PK, SK',
        ExclusiveStartKey: startKey,
      }),
    );
    keys.push(...((page.Items ?? []) as Key[]));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return keys.filter((k) => k.PK.startsWith('TEAM#') || k.PK === GAME_KEY.PK);
};

const gamemasters = async (): Promise<Set<string>> => {
  const names = new Set<string>();
  let token: string | undefined;
  do {
    const page = await cognito.send(
      new ListUsersInGroupCommand({
        UserPoolId: config.userPoolId,
        GroupName: 'gamemaster',
        NextToken: token,
      }),
    );
    for (const u of page.Users ?? []) if (u.Username) names.add(u.Username);
    token = page.NextToken;
  } while (token);
  return names;
};

const teamLogins = async (): Promise<string[]> => {
  const keep = await gamemasters();
  const names: string[] = [];
  let token: string | undefined;
  do {
    const page = await cognito.send(
      new ListUsersCommand({ UserPoolId: config.userPoolId, PaginationToken: token }),
    );
    for (const u of page.Users ?? []) {
      if (u.Username && !keep.has(u.Username)) names.push(u.Username);
    }
    token = page.PaginationToken;
  } while (token);
  return names;
};

const teamPhotos = async (): Promise<string[]> => {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: config.assetsBucket,
        Prefix: 'teams/',
        ContinuationToken: token,
      }),
    );
    for (const o of page.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = page.NextContinuationToken;
  } while (token);
  return keys;
};

const chunks = <T>(list: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, (i + 1) * size),
  );

const deleteItems = async (keys: Key[]): Promise<void> => {
  for (const chunk of chunks(keys, 25)) {
    let requests = chunk.map((Key) => ({ DeleteRequest: { Key } }));
    for (let attempt = 0; requests.length > 0; attempt++) {
      if (attempt > 5) throw new Error('DynamoDB kept returning unprocessed deletes');
      const res = await db.send(
        new BatchWriteCommand({ RequestItems: { [config.gameTable]: requests } }),
      );
      requests = (res.UnprocessedItems?.[config.gameTable] ?? []) as typeof requests;
      if (requests.length > 0) await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
    }
  }
};

/** With dryRun, only counts what would go. */
export const resetGame = async ({ dryRun = false } = {}): Promise<ResetSummary> => {
  const [keys, logins, photos] = await Promise.all([gameKeys(), teamLogins(), teamPhotos()]);
  const summary: ResetSummary = {
    teams: keys.filter((k) => k.SK === 'PROFILE').length,
    items: keys.length,
    logins: logins.length,
    photos: photos.length,
  };
  if (dryRun) return summary;

  await deleteItems(keys);
  for (const Username of logins) {
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: config.userPoolId, Username }));
  }
  for (const chunk of chunks(photos, 1000)) {
    const res = await s3.send(
      new DeleteObjectsCommand({
        Bucket: config.assetsBucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    // DeleteObjects succeeds as a call even when some objects fail.
    if (res.Errors?.length) {
      throw new Error(`${res.Errors.length} photo(s) not deleted, e.g. ${res.Errors[0]!.Key}`);
    }
  }
  return summary;
};
