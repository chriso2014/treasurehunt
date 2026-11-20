import { describe, expect, it } from 'vitest';
import { currentStageSchema } from './state.js';

describe('currentStageSchema', () => {
  it('reads a last result without tick counts, from a server older than the app', () => {
    const lastResult = currentStageSchema.shape.lastResult.parse({ result: 'wrong', reason: null });
    expect(lastResult).toEqual({ result: 'wrong', reason: null, ticks: null });
  });
});
