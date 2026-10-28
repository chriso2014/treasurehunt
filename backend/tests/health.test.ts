import { afterEach, describe, expect, it, vi } from 'vitest';
import { healthResponseSchema } from '@treasurehunt/shared';
import { handler } from '../src/handlers/public/health.js';
import { clock } from '../src/lib/clock.js';

describe('GET /health', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns ok with the server time', async () => {
    vi.spyOn(clock, 'now').mockReturnValue(new Date('2026-10-28T12:00:00.000Z'));
    const res = await handler();
    if (typeof res === 'string') throw new Error('expected a structured response');
    expect(res.statusCode).toBe(200);
    const body = healthResponseSchema.parse(JSON.parse(res.body ?? ''));
    expect(body.time).toBe('2026-10-28T12:00:00.000Z');
  });
});
