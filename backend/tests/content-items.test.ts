import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameContentSchema } from '@treasurehunt/shared';
import { contentToItems, staleKeys } from '../src/lib/content-items.js';

const example = gameContentSchema.parse(
  JSON.parse(readFileSync(new URL('../../content/game.example.json', import.meta.url), 'utf8')),
);

describe('contentToItems', () => {
  it('writes config, both routes and one item per question', () => {
    const items = contentToItems(example);
    expect(items.map((i) => `${i.PK}|${i.SK}`)).toEqual([
      'CONFIG|CONFIG',
      'ROUTE#A|ROUTE',
      'ROUTE#B|ROUTE',
      'QUESTION#q1|QUESTION',
      'QUESTION#q2|QUESTION',
      'QUESTION#q3|QUESTION',
      'QUESTION#q4|QUESTION',
    ]);
    expect(items[1]).toEqual({ PK: 'ROUTE#A', SK: 'ROUTE', questionIds: ['q1', 'q2', 'q3', 'q4'] });
    expect(items[3]).toMatchObject({ id: 'q1', type: 'multiple_choice', correctOptionId: 'b' });
  });

  it('does not copy the file comment into the table', () => {
    const withComment = { ...example, _comment: 'notes' };
    expect(contentToItems(withComment).some((i) => '_comment' in i)).toBe(false);
  });
});

describe('staleKeys', () => {
  it('returns only keys that are not in the new content', () => {
    const existing = [
      { PK: 'CONFIG', SK: 'CONFIG' },
      { PK: 'QUESTION#old', SK: 'QUESTION' },
    ];
    expect(staleKeys(existing, contentToItems(example))).toEqual([
      { PK: 'QUESTION#old', SK: 'QUESTION' },
    ]);
  });
});
