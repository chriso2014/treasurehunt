import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { AuthedEvent } from '../src/lib/auth.js';

// Minimal API Gateway HTTP API events for handler tests.

export const publicEvent = (body?: unknown): APIGatewayProxyEventV2 =>
  ({
    body: body === undefined ? undefined : JSON.stringify(body),
    isBase64Encoded: false,
    requestContext: {},
  }) as unknown as APIGatewayProxyEventV2;

export const teamEvent = (
  teamId: string,
  body?: unknown,
  extraClaims: Record<string, unknown> = {},
): AuthedEvent =>
  ({
    body: body === undefined ? undefined : JSON.stringify(body),
    isBase64Encoded: false,
    requestContext: {
      authorizer: { jwt: { claims: { sub: teamId, ...extraClaims }, scopes: [] } },
    },
  }) as unknown as AuthedEvent;

export const parse = (res: APIGatewayProxyResultV2) => {
  if (typeof res === 'string') throw new Error('expected a structured response');
  return {
    status: res.statusCode, // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON for assertions
    body: JSON.parse(res.body ?? '{}') as Record<string, any>,
  };
};
