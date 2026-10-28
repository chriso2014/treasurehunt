import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('accepts a valid response', () => {
    const body = { ok: true, env: 'dev', time: '2026-10-28T12:00:00.000Z' };
    expect(healthResponseSchema.parse(body)).toEqual(body);
  });

  it('rejects a response that is not ok', () => {
    expect(healthResponseSchema.safeParse({ ok: false, env: 'dev', time: 'x' }).success).toBe(
      false,
    );
  });
});
