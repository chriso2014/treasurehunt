import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  contentImageKeys,
  gameContentSchema,
  questionImageKey,
  type GameContent,
  type Question,
} from './content.js';

const example = (): GameContent =>
  JSON.parse(
    readFileSync(new URL('../../content/game.example.json', import.meta.url), 'utf8'),
  ) as GameContent;

const issues = (content: unknown): string[] => {
  const result = gameContentSchema.safeParse(content);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('gameContentSchema', () => {
  it('accepts the committed example file', () => {
    expect(issues(example())).toEqual([]);
  });

  it('rejects a multiple choice question whose correct option is not an option', () => {
    const content = example();
    const q = content.questions[0];
    if (q?.type !== 'multiple_choice') throw new Error('expected q1 to be multiple_choice');
    q.correctOptionId = 'z';
    expect(issues(content)).toEqual([
      'questions.0.correctOptionId: correctOptionId must be one of the options',
    ]);
  });

  it('accepts a tick-box question and rejects one whose answers are not options', () => {
    const content = example();
    const q = content.questions[0]!;
    content.questions[0] = {
      id: q.id,
      location: q.location,
      clue: q.clue,
      question: q.question,
      hint: q.hint,
      type: 'multi_select',
      options: [
        { id: 'a', text: 'One' },
        { id: 'b', text: 'Two' },
        { id: 'c', text: 'Three' },
      ],
      correctOptionIds: ['a', 'c'],
    };
    expect(issues(content)).toEqual([]);
    (content.questions[0] as { correctOptionIds: string[] }).correctOptionIds = ['a', 'z'];
    expect(issues(content)).toEqual([
      'questions.0.correctOptionIds: correctOptionIds must all be options',
    ]);
    const q0 = content.questions[0] as { options: { id: string; text: string }[] };
    q0.options = Array.from({ length: 31 }, (_, i) => ({ id: `o${i}`, text: `Option ${i}` }));
    (content.questions[0] as { correctOptionIds: string[] }).correctOptionIds = ['o1'];
    expect(issues(content)).toEqual([
      'questions.0.options: Too big: expected array to have <=30 items',
    ]);
  });

  it('rejects a location outside Hitchin, e.g. a missing minus sign', () => {
    const content = example();
    content.questions[0]!.location.lng = 0.28;
    expect(issues(content)).toEqual([
      'questions.0.location: must be in Hitchin (lat 51.93 to 51.97, lng -0.31 to -0.25)',
    ]);
  });

  it('rejects a free text question with no accepted answers', () => {
    const content = example();
    const q = content.questions[1];
    if (q?.type !== 'free_text') throw new Error('expected q2 to be free_text');
    q.acceptedAnswers = [];
    expect(issues(content)).toHaveLength(1);
  });

  it('rejects misspelt fields so typos in the content file are caught', () => {
    const content = example() as unknown as { questions: Record<string, unknown>[] };
    content.questions[1]!.acceptedAnswer = ['1850'];
    expect(issues(content).join()).toContain('acceptedAnswer');
  });

  it('rejects a route that skips a question or visits an unknown one', () => {
    const content = example();
    content.routes.B = ['q3', 'q1', 'q9', 'q4'];
    expect(issues(content)).toEqual([
      'routes.B: route is missing q2',
      'routes.B: unknown questions q9',
    ]);
  });

  it('rejects a route that does not end with the dance', () => {
    const content = example();
    content.routes.A = ['q1', 'q2', 'q4', 'q3'];
    expect(issues(content)).toEqual(['routes.A: route must end with the video_call question']);
  });

  it('rejects duplicate question ids', () => {
    const content = example();
    content.questions[2]!.id = 'q1';
    expect(issues(content)).toContain('questions: question ids must be unique');
  });

  it('rejects image keys outside content/', () => {
    const content = example();
    content.questions[0]!.clue.imageKey = 'teams/x.jpg';
    expect(issues(content)).toEqual([
      'questions.0.clue.imageKey: must look like content/<name>.jpg',
    ]);
  });
});

describe('contentImageKeys', () => {
  it('lists each referenced image once', () => {
    const content = example();
    content.questions[0]!.hint.imageKey = 'content/q2-clue.jpg';
    expect(contentImageKeys(content)).toEqual(['content/q2-clue.jpg']);
  });
});

describe('questionImageKey', () => {
  const pool = ['content/p0.jpg', 'content/p1.jpg', 'content/p2.jpg', 'content/p3.jpg'];
  const withPool = (slot?: number): Question => ({
    id: 'q',
    type: 'photo',
    location: { name: 'L', lat: 51.95, lng: -0.28 },
    clue: { text: 'c' },
    question: { text: 'Recreate this', randomImageKeys: pool, randomImageSlot: slot },
    hint: { text: 'h' },
  });

  it('uses the fixed image when there is no pool', () => {
    const q = { ...withPool(), question: { text: 't', imageKey: 'content/x.jpg' } };
    expect(questionImageKey(q, 'team-1')).toBe('content/x.jpg');
  });

  it('picks the same pool image for a team every time', () => {
    const key = questionImageKey(withPool(), 'team-1');
    expect(pool).toContain(key);
    expect(questionImageKey(withPool(), 'team-1')).toBe(key);
  });

  it('gives one team different images in different slots', () => {
    expect(questionImageKey(withPool(0), 'team-1')).not.toBe(
      questionImageKey(withPool(1), 'team-1'),
    );
  });

  it('spreads teams across the pool', () => {
    const picks = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((t) => questionImageKey(withPool(), t)),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it('is listed for upload and refuses a fixed image as well', () => {
    const content = example();
    content.questions[0]!.question = { text: 't', randomImageKeys: ['content/m1.jpg'] };
    expect(issues(content)).toEqual([]);
    expect(contentImageKeys(content)).toContain('content/m1.jpg');
    content.questions[0]!.question.imageKey = 'content/x.jpg';
    expect(issues(content)).toEqual([
      'questions.0.question: use imageKey or randomImageKeys, not both',
    ]);
  });
});
