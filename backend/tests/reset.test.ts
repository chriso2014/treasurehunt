import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { resetGame } from '../src/lib/reset.js';

const db = mockClient(DynamoDBDocumentClient);
const cognito = mockClient(CognitoIdentityProviderClient);
const s3 = mockClient(S3Client);

describe('resetGame', () => {
  beforeEach(() => {
    db.reset();
    cognito.reset();
    s3.reset();
    db.on(ScanCommand)
      .resolvesOnce({
        Items: [
          { PK: 'GAME', SK: 'STATE' },
          { PK: 'TEAM#t1', SK: 'PROFILE' },
        ],
        LastEvaluatedKey: { PK: 'TEAM#t1', SK: 'PROFILE' },
      })
      .resolvesOnce({
        Items: [
          { PK: 'TEAM#t1', SK: 'STAGE#01' },
          { PK: 'TEAM#t2', SK: 'PROFILE' },
          { PK: 'OTHER', SK: 'X' },
        ],
      });
    db.on(BatchWriteCommand).resolves({});
    cognito.on(ListUsersInGroupCommand).resolves({ Users: [{ Username: 'gamemaster' }] });
    cognito
      .on(ListUsersCommand)
      .resolves({ Users: [{ Username: 'gamemaster' }, { Username: 'team-one' }] });
    cognito.on(AdminDeleteUserCommand).resolves({});
    s3.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'teams/t1/team-photo.jpg' }] });
    s3.on(DeleteObjectsCommand).resolves({});
  });

  it('counts without deleting on a dry run', async () => {
    expect(await resetGame({ dryRun: true })).toEqual({
      teams: 2,
      items: 4,
      logins: 1,
      photos: 1,
    });
    expect(db.commandCalls(BatchWriteCommand)).toHaveLength(0);
    expect(cognito.commandCalls(AdminDeleteUserCommand)).toHaveLength(0);
    expect(s3.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
  });

  it('deletes game and team items, team logins and team photos, keeping the GM', async () => {
    await resetGame();
    const deletes =
      db.commandCalls(BatchWriteCommand)[0]!.args[0].input.RequestItems!['game-table']!;
    expect(deletes.map((d) => d.DeleteRequest?.Key)).toEqual([
      { PK: 'GAME', SK: 'STATE' },
      { PK: 'TEAM#t1', SK: 'PROFILE' },
      { PK: 'TEAM#t1', SK: 'STAGE#01' },
      { PK: 'TEAM#t2', SK: 'PROFILE' },
    ]);
    const deletedUsers = cognito
      .commandCalls(AdminDeleteUserCommand)
      .map((c) => c.args[0].input.Username);
    expect(deletedUsers).toEqual(['team-one']);
    expect(s3.commandCalls(ListObjectsV2Command)[0]!.args[0].input.Prefix).toBe('teams/');
    expect(s3.commandCalls(DeleteObjectsCommand)[0]!.args[0].input.Delete?.Objects).toEqual([
      { Key: 'teams/t1/team-photo.jpg' },
    ]);
  });

  it('retries deletes DynamoDB leaves unprocessed', async () => {
    db.on(BatchWriteCommand)
      .resolvesOnce({
        UnprocessedItems: {
          'game-table': [{ DeleteRequest: { Key: { PK: 'GAME', SK: 'STATE' } } }],
        },
      })
      .resolves({});
    await resetGame();
    expect(db.commandCalls(BatchWriteCommand)).toHaveLength(2);
  });
});
