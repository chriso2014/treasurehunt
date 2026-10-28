import { describe, expect, it } from 'vitest';
import { registerTeamRequestSchema, teamNameSchema, teamSlug } from './team.js';

describe('teamSlug', () => {
  it.each([
    ['The Wanderers', 'the-wanderers'],
    ['  Café   Crew  ', 'cafe-crew'],
    ["Rock & Roll's Finest!", 'rock-rolls-finest'],
    ['Team - 7', 'team-7'],
    ['ÜBER', 'uber'],
  ])('%s -> %s', (name, slug) => {
    expect(teamSlug(name)).toBe(slug);
  });
});

describe('teamNameSchema', () => {
  it('trims and accepts a normal name', () => {
    expect(teamNameSchema.parse('  The Wanderers ')).toBe('The Wanderers');
  });

  it.each(['A', '!!', 'x'.repeat(31), 'Bad<script>'])('rejects %j', (name) => {
    expect(teamNameSchema.safeParse(name).success).toBe(false);
  });
});

describe('registerTeamRequestSchema', () => {
  it('rejects a short password', () => {
    expect(registerTeamRequestSchema.safeParse({ name: 'Team', password: 'short' }).success).toBe(
      false,
    );
  });
});
