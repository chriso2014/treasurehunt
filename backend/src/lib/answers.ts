import type { Question } from '@treasurehunt/shared';

// Answer checking (docs/02-domain-and-glossary.md "Text answer matching"). Pure, server-side only.

type FreeText = Extract<Question, { type: 'free_text' }>;
type MultipleChoice = Extract<Question, { type: 'multiple_choice' }>;

export const checkMultipleChoice = (question: MultipleChoice, optionId: string): boolean =>
  optionId === question.correctOptionId;

const ARTICLES = /^(the|a|an) /;

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export const normalise = (text: string, ignoreArticles = false): string => {
  const plain = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}.\s-]/gu, ' ')
    .replace(/(?<!\d)[.-]|[.-](?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ignoreArticles ? plain.replace(ARTICLES, '') : plain;
};

export const levenshtein = (a: string, b: string): number => {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length]!;
};

/**
 * Default typo allowance for an accepted answer: none for numbers or very short words,
 * 1 up to 6 characters, 2 for longer.
 */
export const defaultMaxTypos = (answer: string): number => {
  if (/^[\d\s.-]+$/.test(answer) || answer.length <= 3) return 0;
  return answer.length <= 6 ? 1 : 2;
};

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** "one thousand eight hundred and fifty" → 1850; undefined if the words aren't a number. */
export const wordsToNumber = (text: string): number | undefined => {
  const words = text
    .replace(/-/g, ' ')
    .split(' ')
    .filter((w) => w && w !== 'and');
  if (words.length === 0) return undefined;
  let total = 0;
  let current = 0;
  for (const word of words) {
    if (word in UNITS) current += UNITS[word]!;
    else if (word === 'hundred') current = (current || 1) * 100;
    else if (word === 'thousand') {
      total += (current || 1) * 1000;
      current = 0;
    } else return undefined;
  }
  return total + current;
};

/** The number in a normalised submission: its only number in digits ("1,850" normalises to "1 850"), or words. */
export const parseNumber = (text: string): number | undefined => {
  const joined = text.replace(/(\d) (?=\d{3}\b)/g, '$1');
  const numbers = joined.match(/-?\d+(\.\d+)?/g) ?? [];
  if (numbers.length === 1) return Number(numbers[0]);
  if (numbers.length > 1) return undefined;
  return wordsToNumber(text);
};

export const checkFreeText = (question: FreeText, submission: string): boolean => {
  const { matching = {} } = question;
  const ignoreArticles = matching.ignoreArticles ?? false;
  const given = normalise(submission, ignoreArticles);
  if (given === '') return false;

  for (const accepted of question.acceptedAnswers) {
    const target = normalise(accepted, ignoreArticles);
    const maxTypos = matching.maxTypos ?? defaultMaxTypos(target);
    if (levenshtein(given, target) <= maxTypos) return true;
  }

  if (matching.contains?.some((word) => ` ${given} `.includes(` ${normalise(word)} `))) {
    return true;
  }

  if (matching.numeric) {
    const value = parseNumber(given);
    if (
      value !== undefined &&
      Math.abs(value - matching.numeric.value) <= matching.numeric.tolerance
    ) {
      return true;
    }
  }
  return false;
};
