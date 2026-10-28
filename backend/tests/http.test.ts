import { describe, expect, it } from 'vitest';
import { AppError, errorResponse } from '../src/lib/http.js';

describe('errorResponse', () => {
  it('maps an AppError to its status and code', () => {
    const res = errorResponse(new AppError('invalid_state', 'Not now', 409));
    expect(res).toMatchObject({ statusCode: 409 });
    expect(JSON.parse((res as { body: string }).body)).toEqual({
      error: { code: 'invalid_state', message: 'Not now' },
    });
  });

  it('hides details of unexpected errors', () => {
    const res = errorResponse(new Error('secret table name'));
    expect(res).toMatchObject({ statusCode: 500 });
    expect((res as { body: string }).body).not.toContain('secret');
  });
});
