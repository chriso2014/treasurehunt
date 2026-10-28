import { describe, expect, it } from 'vitest';
import { formatDuration } from './time.js';

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [95_000, '1:35'],
    [599_999, '9:59'],
    [3_725_000, '1:02:05'],
    [-5, '0:00'],
  ])('%i -> %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});
