import { describe, expect, it } from 'vitest';
import { isGamemaster } from '../src/lib/auth.js';
import { routeForRegistration } from '../src/lib/registration.js';
import { teamEvent } from './events.js';

describe('isGamemaster', () => {
  it.each([
    [['gamemaster'], true],
    ['[gamemaster other]', true],
    ['gamemaster', true],
    ['[other]', false],
    [undefined, false],
  ])('cognito:groups %j -> %s', (groups, expected) => {
    expect(isGamemaster(teamEvent('x', undefined, { 'cognito:groups': groups }))).toBe(expected);
  });
});

describe('routeForRegistration', () => {
  it('alternates A, B, A', () => {
    expect([1, 2, 3].map(routeForRegistration)).toEqual(['A', 'B', 'A']);
  });
});
