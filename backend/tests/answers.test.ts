import { describe, expect, it } from 'vitest';
import type { Question } from '@treasurehunt/shared';
import {
  checkFreeText,
  checkMultipleChoice,
  defaultMaxTypos,
  levenshtein,
  normalise,
  parseNumber,
} from '../src/lib/answers.js';

type FreeText = Extract<Question, { type: 'free_text' }>;

const base = {
  id: 'q',
  location: { name: 'L', lat: 51.9, lng: -0.28 },
  clue: { text: 'c' },
  question: { text: 'q' },
  hint: { text: 'h' },
};

const freeText = (acceptedAnswers: string[], matching?: FreeText['matching']): FreeText => ({
  ...base,
  type: 'free_text',
  acceptedAnswers,
  matching,
});

describe('checkMultipleChoice', () => {
  const q = {
    ...base,
    type: 'multiple_choice' as const,
    options: [
      { id: 'a', text: 'Red' },
      { id: 'b', text: 'Blue' },
    ],
    correctOptionId: 'b',
  };
  it('accepts only the correct option id', () => {
    expect(checkMultipleChoice(q, 'b')).toBe(true);
    expect(checkMultipleChoice(q, 'a')).toBe(false);
    expect(checkMultipleChoice(q, 'Blue')).toBe(false);
  });
});

describe('normalise', () => {
  it.each([
    ['  St. Mary’s  Church! ', 'st marys church'],
    ['CAFÉ', 'cafe'],
    ['The Sun Inn', 'the sun inn'],
    ['1,850', '1 850'],
    ['3.5', '3.5'],
    ['well-known', 'well known'],
  ])('%j -> %j', (input, expected) => {
    expect(normalise(input)).toBe(expected);
  });

  it('drops a leading article when asked', () => {
    expect(normalise('The Sun Inn', true)).toBe('sun inn');
    expect(normalise('Theatre', true)).toBe('theatre');
  });
});

describe('levenshtein', () => {
  it.each([
    ['kitten', 'sitting', 3],
    ['', 'abc', 3],
    ['same', 'same', 0],
    ['church', 'chruch', 2],
  ])('%s/%s = %i', (a, b, d) => {
    expect(levenshtein(a, b)).toBe(d);
  });
});

describe('defaultMaxTypos', () => {
  it.each([
    ['1850', 0],
    ['cat', 0],
    ['bridge', 1],
    ['hitchin priory', 2],
  ])('%s -> %i', (answer, n) => {
    expect(defaultMaxTypos(answer)).toBe(n);
  });
});

describe('parseNumber', () => {
  it.each([
    ['1850', 1850],
    ['1 850', 1850],
    ['year 1850', 1850],
    ['seven', 7],
    ['twenty one', 21],
    ['one thousand eight hundred and fifty', 1850],
    ['many', undefined],
    ['1850 or 1851', undefined],
  ])('%j -> %j', (text, n) => {
    expect(parseNumber(text)).toBe(n);
  });
});

describe('checkFreeText', () => {
  it('accepts exact answers regardless of case, accents and punctuation', () => {
    const q = freeText(['St Mary’s']);
    expect(checkFreeText(q, 'st marys')).toBe(true);
    expect(checkFreeText(q, 'ST. MARY’S!')).toBe(true);
  });

  it('allows a typo or two by length', () => {
    const q = freeText(['Hitchin Priory']);
    expect(checkFreeText(q, 'hitchen priory')).toBe(true);
    expect(checkFreeText(q, 'hitchen priry')).toBe(true);
    expect(checkFreeText(q, 'hitchen proiyr')).toBe(false);
  });

  it('accepts any of several answers', () => {
    const q = freeText(['lion', 'a lion']);
    expect(checkFreeText(q, 'A Lion')).toBe(true);
    expect(checkFreeText(q, 'tiger')).toBe(false);
  });

  it('does not let a typo turn into a different number', () => {
    const q = freeText(['1850']);
    expect(checkFreeText(q, '1850')).toBe(true);
    expect(checkFreeText(q, '1851')).toBe(false);
  });

  it('honours an explicit maxTypos', () => {
    const q = freeText(['bridge'], { maxTypos: 0 });
    expect(checkFreeText(q, 'brigde')).toBe(false);
  });

  it('ignores leading articles when configured', () => {
    expect(checkFreeText(freeText(['Sun Inn'], { ignoreArticles: true }), 'the sun inn')).toBe(
      true,
    );
    expect(checkFreeText(freeText(['Sun Inn']), 'the sun inn')).toBe(false);
  });

  it('accepts a submission containing a required keyword', () => {
    const q = freeText(['St Marys Church'], { contains: ['St Marys'] });
    expect(checkFreeText(q, 'I think it is St Mary’s, by the river')).toBe(true);
    expect(checkFreeText(q, 'St Martins')).toBe(false);
  });

  it('accepts numbers within tolerance, as digits or words', () => {
    const q = freeText(['1850'], { numeric: { value: 1850, tolerance: 0 } });
    expect(checkFreeText(q, '1,850')).toBe(true);
    expect(checkFreeText(q, 'eighteen hundred and fifty')).toBe(true);
    expect(checkFreeText(q, 'one thousand eight hundred and fifty')).toBe(true);
    expect(checkFreeText(q, '1849')).toBe(false);
    const roughly = freeText(['12'], { numeric: { value: 12, tolerance: 1 } });
    expect(checkFreeText(roughly, '13')).toBe(true);
    expect(checkFreeText(roughly, 'fourteen')).toBe(false);
  });

  it('never accepts an empty or punctuation-only answer', () => {
    expect(checkFreeText(freeText(['a']), '  !! ')).toBe(false);
  });
});
