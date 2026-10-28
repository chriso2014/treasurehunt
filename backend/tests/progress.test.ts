import { describe, expect, it } from 'vitest';
import { completeStageItems } from '../src/lib/progress.js';
import { elapsedMs, paused } from '../src/lib/timer.js';
import { profile, stage } from './fixtures.js';

const now = new Date('2026-10-28T10:10:00.000Z');

describe('timer', () => {
  it('adds the running interval to the stored time', () => {
    expect(elapsedMs({ activeMs: 5000, runningSince: '2026-10-28T10:09:00.000Z' }, now)).toBe(
      65_000,
    );
  });

  it('does not count time while paused', () => {
    expect(elapsedMs({ activeMs: 5000 }, now)).toBe(5000);
  });

  it('pausing banks the running interval', () => {
    expect(paused({ activeMs: 1000, runningSince: '2026-10-28T10:09:59.000Z' }, now)).toEqual({
      activeMs: 2000,
    });
  });

  it('ignores a running start in the future (clock skew between Lambdas)', () => {
    expect(elapsedMs({ activeMs: 0, runningSince: '2026-10-28T10:10:01.000Z' }, now)).toBe(0);
  });
});

describe('completeStageItems', () => {
  it('finishes the team on the last stage without opening another', () => {
    const items = completeStageItems({
      profile: profile({ currentStage: 3 }),
      stage: stage({
        stage: 3,
        questionId: 'q4',
        status: 'awaiting_review',
        activeMs: 30_000,
        penaltyMs: 0,
      }),
      nextQuestionId: undefined,
      outcome: 'declined',
      extraPenaltyMs: 300_000,
      now,
    });
    expect(items).toHaveLength(2);
    expect(items[0]!.Update!.ExpressionAttributeValues).toMatchObject({
      ':done': 'completed',
      ':activeMs': 30_000,
      ':penaltyMs': 300_000,
      ':expected': 'awaiting_review',
    });
    expect(items[1]!.Update!.UpdateExpression).toContain('#status = :finished');
    expect(items[1]!.Update!.ExpressionAttributeValues).toMatchObject({
      ':penaltyMs': 300_000,
      ':finished': 'finished',
    });
  });

  it('marks a skipped stage as skipped', () => {
    const items = completeStageItems({
      profile: profile(),
      stage: stage({ status: 'revealed', runningSince: now.toISOString(), hintUsed: true }),
      nextQuestionId: 'q2',
      outcome: 'skipped',
      extraPenaltyMs: 300_000,
      now,
    });
    expect(items[0]!.Update!.ExpressionAttributeValues).toMatchObject({
      ':done': 'skipped',
      ':skipped': true,
    });
  });
});
