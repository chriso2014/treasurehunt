import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { teamStateSchema } from '@treasurehunt/shared';
import { handler } from '../src/handlers/team/state.js';
import { parse, teamEvent } from './events.js';

const db = mockClient(DynamoDBDocumentClient);

describe('GET /teams/me/state', () => {
  beforeEach(() => db.reset());

  it('returns the caller’s team and the game status', async () => {
    db.on(GetCommand, { Key: { PK: 'GAME', SK: 'STATE' } }).resolves({
      Item: { status: 'registration', registrationCounter: 3 },
    });
    db.on(GetCommand, { Key: { PK: 'TEAM#team-1', SK: 'PROFILE' } }).resolves({
      Item: {
        name: 'Team',
        route: 'B',
        status: 'registered',
        photoKey: 'teams/team-1/team-photo.jpg',
      },
    });
    const res = parse(await handler(teamEvent('team-1')));
    expect(res.status).toBe(200);
    const state = teamStateSchema.parse(res.body);
    expect(state.team).toMatchObject({ name: 'Team', route: 'B', status: 'registered' });
    expect(state.team.photoUrl).toContain('teams/team-1/team-photo.jpg');
    expect(state.game.status).toBe('registration');
  });

  it('only reads the caller’s own team', async () => {
    db.on(GetCommand).resolves({});
    const res = parse(await handler(teamEvent('team-1')));
    expect(res.status).toBe(404);
    const keys = db.commandCalls(GetCommand).map((c) => c.args[0].input.Key?.PK);
    expect(keys).toEqual(expect.arrayContaining(['GAME', 'TEAM#team-1']));
    expect(keys.every((k) => k === 'GAME' || k === 'TEAM#team-1')).toBe(true);
  });
});
