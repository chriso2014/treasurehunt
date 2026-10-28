import type { APIGatewayProxyResultV2 } from 'aws-lambda';

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
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
    : json(500, { error: { code: 'internal', message: 'Something went wrong' } });
