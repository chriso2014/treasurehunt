import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  InvalidPasswordException,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../src/handlers/public/register.js';
import { parse, publicEvent } from './events.js';

const cognito = mockClient(CognitoIdentityProviderClient);
const db = mockClient(DynamoDBDocumentClient);

const createdUser = { User: { Attributes: [{ Name: 'sub', Value: 'team-1' }] } };

describe('POST /teams', () => {
  beforeEach(() => {
    cognito.reset();
    db.reset();
    cognito.on(AdminCreateUserCommand).resolves(createdUser);
    cognito.on(AdminDeleteUserCommand).resolves({});
    db.on(UpdateCommand).resolves({ Attributes: { registrationCounter: 1 } });
  });

  it('creates the user with the slug and writes a registered team on route A', async () => {
    const res = parse(
      await handler(publicEvent({ name: ' The Wanderers ', password: 'password1' })),
    );
    expect(res).toEqual({
      status: 201,
      body: { teamId: 'team-1', slug: 'the-wanderers', route: 'A' },
    });
    expect(cognito.commandCalls(AdminCreateUserCommand)[0]!.args[0].input).toMatchObject({
      Username: 'the-wanderers',
      MessageAction: 'SUPPRESS',
    });
    expect(cognito.commandCalls(AdminSetUserPasswordCommand)[0]!.args[0].input).toMatchObject({
      Password: 'password1',
      Permanent: true,
    });
    const item = db.commandCalls(PutCommand)[0]!.args[0].input.Item;
    expect(item).toMatchObject({
      PK: 'TEAM#team-1',
      SK: 'PROFILE',
      name: 'The Wanderers',
      status: 'registered',
      route: 'A',
    });
  });

  it('alternates routes: the second team gets B', async () => {
    db.on(UpdateCommand).resolves({ Attributes: { registrationCounter: 2 } });
    const res = parse(await handler(publicEvent({ name: 'Team Two', password: 'password1' })));
    expect(res.body.route).toBe('B');
  });

  it('rejects an invalid body before touching Cognito', async () => {
    const res = parse(await handler(publicEvent({ name: 'X', password: 'password1' })));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(cognito.calls()).toHaveLength(0);
  });

  it('returns TEAM_NAME_TAKEN when the slug exists', async () => {
    cognito
      .on(AdminCreateUserCommand)
      .rejects(new UsernameExistsException({ message: 'exists', $metadata: {} }));
    const res = parse(await handler(publicEvent({ name: 'The Wanderers', password: 'password1' })));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEAM_NAME_TAKEN');
    expect(cognito.commandCalls(AdminDeleteUserCommand)).toHaveLength(0);
  });

  it('deletes the Cognito user if Cognito rejects the password', async () => {
    cognito
      .on(AdminSetUserPasswordCommand)
      .rejects(new InvalidPasswordException({ message: 'bad', $metadata: {} }));
    const res = parse(await handler(publicEvent({ name: 'Team', password: 'password1' })));
    expect(res.body.error.code).toBe('VALIDATION');
    expect(cognito.commandCalls(AdminDeleteUserCommand)[0]!.args[0].input.Username).toBe('team');
  });

  it('deletes the Cognito user and refuses once the game has started', async () => {
    db.on(UpdateCommand).rejects(
      new ConditionalCheckFailedException({ message: 'no', $metadata: {} }),
    );
    const res = parse(await handler(publicEvent({ name: 'Late Team', password: 'password1' })));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
    expect(cognito.commandCalls(AdminDeleteUserCommand)).toHaveLength(1);
    expect(db.commandCalls(PutCommand)).toHaveLength(0);
  });

  it('deletes the Cognito user and hides details if the team write fails', async () => {
    db.on(PutCommand).rejects(new Error('table gone'));
    const res = parse(await handler(publicEvent({ name: 'Team', password: 'password1' })));
    expect(res).toEqual({
      status: 500,
      body: { error: { code: 'INTERNAL', message: 'Something went wrong' } },
    });
    expect(cognito.commandCalls(AdminDeleteUserCommand)).toHaveLength(1);
  });
});
