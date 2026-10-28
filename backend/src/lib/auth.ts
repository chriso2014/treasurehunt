import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { AppError } from './http.js';

export type AuthedEvent = APIGatewayProxyEventV2WithJWTAuthorizer;

/** The caller's teamId: always the token's `sub`, never request input. */
export const teamIdFrom = (event: AuthedEvent): string => {
  const sub = event.requestContext.authorizer?.jwt?.claims?.sub;
  if (typeof sub !== 'string' || sub === '') throw new AppError('UNAUTHENTICATED', 'Sign in first');
  return sub;
};

/** Cognito puts groups in the access token as `cognito:groups`; API Gateway may pass it as "[a b]". */
export const isGamemaster = (event: AuthedEvent): boolean => {
  const groups = event.requestContext.authorizer?.jwt?.claims?.['cognito:groups'];
  const list = Array.isArray(groups)
    ? groups.map(String)
    : String(groups ?? '')
        .replace(/^\[|\]$/g, '')
        .split(/[\s,]+/);
  return list.includes('gamemaster');
};

export const requireGamemaster = (event: AuthedEvent): void => {
  if (!isGamemaster(event)) throw new AppError('FORBIDDEN', 'Game master only');
};
