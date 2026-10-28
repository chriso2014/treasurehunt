import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { HeadObjectCommand, NotFound, S3Client } from '@aws-sdk/client-s3';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { handler as upload } from '../src/handlers/team/photo-upload.js';
import { handler as confirm } from '../src/handlers/team/photo-confirm.js';
import { parse, teamEvent } from './events.js';

const db = mockClient(DynamoDBDocumentClient);
const s3 = mockClient(S3Client);

const profile = { teamId: 'team-1', name: 'Team', route: 'A', status: 'registered' };
const mockGame = (gameStatus: string | undefined, teamStatus = 'registered') => {
  db.on(GetCommand, { Key: { PK: 'GAME', SK: 'STATE' } }).resolves({
    Item: gameStatus ? { status: gameStatus } : undefined,
  });
  db.on(GetCommand, { Key: { PK: 'TEAM#team-1', SK: 'PROFILE' } }).resolves({
    Item: { ...profile, status: teamStatus },
  });
};

beforeEach(() => {
  db.reset();
  s3.reset();
});

describe('POST /teams/me/photo-upload', () => {
  it('returns a pre-signed POST for the caller’s own photo key', async () => {
    mockGame(undefined);
    const res = parse(await upload(teamEvent('team-1')));
    expect(res.status).toBe(200);
    expect(res.body.key).toBe('teams/team-1/team-photo.jpg');
    expect(res.body.fields).toMatchObject({
      key: 'teams/team-1/team-photo.jpg',
      'Content-Type': 'image/jpeg',
    });
    expect(res.body.url).toContain('assets-bucket');
  });

  it('refuses once the game is live', async () => {
    mockGame('live', 'playing');
    const res = parse(await upload(teamEvent('team-1')));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });

  it('returns 401 without a token subject', async () => {
    const res = parse(await upload(teamEvent('')));
    expect(res.status).toBe(401);
  });
});

describe('POST /teams/me/photo-confirm', () => {
  it('stores the key and returns a view URL', async () => {
    s3.on(HeadObjectCommand).resolves({});
    db.on(UpdateCommand).resolves({});
    const res = parse(await confirm(teamEvent('team-1', { key: 'teams/team-1/team-photo.jpg' })));
    expect(res.status).toBe(200);
    expect(res.body.photoUrl).toContain('teams/team-1/team-photo.jpg');
    expect(db.commandCalls(UpdateCommand)[0]!.args[0].input).toMatchObject({
      Key: { PK: 'TEAM#team-1', SK: 'PROFILE' },
      ExpressionAttributeValues: { ':key': 'teams/team-1/team-photo.jpg' },
    });
  });

  it('refuses another team’s key', async () => {
    const res = parse(await confirm(teamEvent('team-1', { key: 'teams/team-2/team-photo.jpg' })));
    expect(res.status).toBe(400);
    expect(s3.calls()).toHaveLength(0);
  });

  it('says when the upload has not arrived', async () => {
    s3.on(HeadObjectCommand).rejects(new NotFound({ message: 'nope', $metadata: {} }));
    const res = parse(await confirm(teamEvent('team-1', { key: 'teams/team-1/team-photo.jpg' })));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Photo not uploaded yet');
  });

  it('refuses after the team has started playing', async () => {
    s3.on(HeadObjectCommand).resolves({});
    db.on(UpdateCommand).rejects(
      new ConditionalCheckFailedException({ message: 'no', $metadata: {} }),
    );
    const res = parse(await confirm(teamEvent('team-1', { key: 'teams/team-1/team-photo.jpg' })));
    expect(res.status).toBe(409);
  });
});
