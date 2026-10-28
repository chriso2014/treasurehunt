import { describe, expect, it } from 'vitest';
import { teamStateSchema, type Question } from '@treasurehunt/shared';
import { buildState, type StateInput } from '../src/lib/state.js';
import { attempt, contentConfig, profile, q1, q2, q4, record, stage } from './fixtures.js';

const now = new Date('2026-10-28T10:10:00.000Z');
const questions = new Map<string, Question>([
  ['q1', q1],
  ['q2', q2],
  ['q4', q4],
]);
const build = (overrides: Partial<StateInput>) =>
  buildState({
    gameStatus: 'live',
    record: record(),
    stageCount: 3,
    contentConfig,
    questions,
    now,
    signUrl: async (key) => `https://signed/${key}`,
    ...overrides,
  }).then((s) => teamStateSchema.parse(s));

describe('buildState', () => {
  it('shows only the clue before Reveal', async () => {
    const state = await build({});
    expect(state.current).toMatchObject({
      stage: 1,
      status: 'clue',
      type: 'multiple_choice',
      clue: { text: 'Where the market met', imageUrl: 'https://signed/content/q1.jpg' },
      question: null,
      hint: null,
      timer: { elapsedMs: 0, running: false },
    });
    expect(state.team).toMatchObject({ stage: 1, stageCount: 3, totalMs: 0 });
  });

  it('after Reveal shows the question and options but never the correct answer', async () => {
    const state = await build({
      record: record({
        stages: [stage({ status: 'revealed', runningSince: '2026-10-28T10:08:00.000Z' })],
      }),
    });
    expect(state.current?.question).toEqual({
      text: 'What colour is the door?',
      imageUrl: null,
      options: [
        { id: 'a', text: 'Red' },
        { id: 'b', text: 'Blue' },
      ],
    });
    expect(state.current?.timer).toMatchObject({ elapsedMs: 120_000, running: true });
    expect(JSON.stringify(state)).not.toContain('correctOptionId');
    expect(JSON.stringify(state)).not.toContain('Look up');
  });

  it('never includes accepted text answers', async () => {
    const state = await build({
      record: record({
        profile: profile({ currentStage: 2 }),
        stages: [
          stage({ status: 'completed', activeMs: 1000 }),
          stage({
            stage: 2,
            questionId: 'q2',
            status: 'revealed',
            runningSince: now.toISOString(),
          }),
        ],
      }),
    });
    expect(JSON.stringify(state)).not.toContain('1850');
  });

  it('adds penalties and finished stages to the running total', async () => {
    const state = await build({
      record: record({
        profile: profile({ currentStage: 2, totalActiveMs: 90_000, totalPenaltyMs: 300_000 }),
        stages: [
          stage({ status: 'completed', activeMs: 90_000, penaltyMs: 300_000 }),
          stage({
            stage: 2,
            questionId: 'q2',
            status: 'revealed',
            activeMs: 10_000,
            runningSince: '2026-10-28T10:09:00.000Z',
            penaltyMs: 60_000,
          }),
        ],
        attempts: [attempt({ stage: 2, questionId: 'q2', type: 'free_text', value: '1851' })],
      }),
    });
    expect(state.team.totalMs).toBe(90_000 + 300_000 + 70_000 + 60_000);
    expect(state.current?.lastResult).toEqual({ result: 'wrong', reason: null });
  });

  it('lists only completed locations, in stage order', async () => {
    const state = await build({
      record: record({
        profile: profile({ currentStage: 3 }),
        stages: [
          stage({ status: 'completed' }),
          stage({ stage: 2, questionId: 'q2', status: 'skipped' }),
          stage({ stage: 3, questionId: 'q4', status: 'clue' }),
        ],
      }),
    });
    expect(state.completedLocations.map((l) => l.name)).toEqual(['Square', 'Church']);
  });

  it('has no current stage before the start or after finishing', async () => {
    const waiting = await build({
      gameStatus: 'registration',
      record: record({ profile: profile({ status: 'registered' }), stages: [] }),
    });
    expect(waiting.current).toBeNull();
    const finished = await build({
      record: record({ profile: profile({ status: 'finished', totalActiveMs: 5000 }) }),
    });
    expect(finished.current).toBeNull();
    expect(finished.team.totalMs).toBe(5000);
  });
});
