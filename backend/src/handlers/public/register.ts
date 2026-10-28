import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  InvalidPasswordException,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  registerTeamRequestSchema,
  teamSlug,
  type RegisterTeamResponse,
} from '@treasurehunt/shared';
import { cognito, db } from '../../lib/aws.js';
import { nowIso } from '../../lib/clock.js';
import { config } from '../../lib/config.js';
import { GAME_KEY, teamKey, type TeamProfile } from '../../lib/game.js';
import { AppError, json, parseBody, route } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';
import { routeForRegistration } from '../../lib/registration.js';

// POST /teams (public). Creates the Cognito user, assigns a route and writes the team profile.
// If anything after the Cognito user fails, the user is deleted so no half-created team is left.
export const handler = route(async (event: APIGatewayProxyEventV2) => {
  const { name, password } = parseBody(event, registerTeamRequestSchema);
  const slug = teamSlug(name);

  let teamId: string;
  try {
    const created = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: config.userPoolId,
        Username: slug,
        MessageAction: 'SUPPRESS',
      }),
    );
    const sub = created.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
    if (!sub) throw new Error('Cognito returned no sub');
    teamId = sub;
  } catch (err) {
    if (err instanceof UsernameExistsException) {
      throw new AppError('TEAM_NAME_TAKEN', 'That team name is taken');
    }
    throw err;
  }

  try {
    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: config.userPoolId,
        Username: slug,
        Password: password,
        Permanent: true,
      }),
    );

    // Registration counter on the game item; only while the game is still in registration.
    const counter = await db.send(
      new UpdateCommand({
        TableName: config.gameTable,
        Key: GAME_KEY,
        UpdateExpression: 'ADD registrationCounter :one',
        ConditionExpression: 'attribute_not_exists(#status) OR #status = :registration',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':one': 1, ':registration': 'registration' },
        ReturnValues: 'UPDATED_NEW',
      }),
    );
    const teamRoute = routeForRegistration(Number(counter.Attributes?.registrationCounter));

    const profile: TeamProfile = {
      teamId,
      name,
      slug,
      route: teamRoute,
      status: 'registered',
      currentStage: 1,
      registeredAt: nowIso(),
      totalActiveMs: 0,
      totalPenaltyMs: 0,
    };
    await db.send(
      new PutCommand({
        TableName: config.gameTable,
        Item: { ...teamKey(teamId), ...profile },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );

    logger.info('team registered', { teamId, route: teamRoute });
    const body: RegisterTeamResponse = { teamId, slug, route: teamRoute };
    return json(201, body);
  } catch (err) {
    await cognito
      .send(new AdminDeleteUserCommand({ UserPoolId: config.userPoolId, Username: slug }))
      .catch((deleteErr: unknown) =>
        logger.error('rollback failed: Cognito user left behind', { slug, error: deleteErr }),
      );
    if (err instanceof InvalidPasswordException) {
      throw new AppError('VALIDATION', 'Password is not allowed, try a longer one');
    }
    if (err instanceof ConditionalCheckFailedException) {
      throw new AppError('INVALID_STATE', 'Registration has closed');
    }
    throw err;
  }
});
