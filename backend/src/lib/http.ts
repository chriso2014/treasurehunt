import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ErrorCode } from '@treasurehunt/shared';
import type { z } from 'zod';
import { logger } from './logger.js';

const statusFor: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  TEAM_NAME_TAKEN: 409,
  GAME_NOT_LIVE: 409,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.status = statusFor[code];
  }
}

export const json = (status: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode: status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const errorResponse = (err: unknown): APIGatewayProxyResultV2 =>
  err instanceof AppError
    ? json(err.status, { error: { code: err.code, message: err.message } })
    : json(500, { error: { code: 'INTERNAL', message: 'Something went wrong' } });

/** Parses and validates a JSON body, throwing VALIDATION with the first problem. */
export const parseBody = <T extends z.ZodType>(
  event: Pick<APIGatewayProxyEventV2, 'body' | 'isBase64Encoded'>,
  schema: T,
): z.infer<T> => {
  let raw: unknown;
  try {
    const text = event.isBase64Encoded
      ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
      : (event.body ?? '');
    raw = JSON.parse(text || '{}');
  } catch {
    throw new AppError('VALIDATION', 'Body must be JSON');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AppError('VALIDATION', result.error.issues[0]?.message ?? 'Invalid request');
  }
  return result.data;
};

/** A required path parameter, e.g. {teamId}. */
export const pathParam = (
  event: Pick<APIGatewayProxyEventV2, 'pathParameters'>,
  name: string,
): string => {
  const value = event.pathParameters?.[name];
  if (!value) throw new AppError('VALIDATION', `Missing ${name}`);
  return value;
};

/** Wraps a handler: logs and maps errors to the API error format. */
export const route =
  <E>(fn: (event: E) => Promise<APIGatewayProxyResultV2>) =>
  async (event: E): Promise<APIGatewayProxyResultV2> => {
    try {
      return await fn(event);
    } catch (err) {
      if (err instanceof AppError) {
        logger.info('request rejected', { code: err.code });
      } else {
        logger.error('unexpected error', err as Error);
      }
      return errorResponse(err);
    }
  };
