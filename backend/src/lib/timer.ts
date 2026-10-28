// Question timer (ADR-006): accumulated `activeMs` plus the open interval since `runningSince`.
// Only the server's clock counts; durations are integer ms.

export type TimerFields = { activeMs: number; runningSince?: string };

export const elapsedMs = (timer: TimerFields, now: Date): number =>
  timer.activeMs +
  (timer.runningSince ? Math.max(0, now.getTime() - Date.parse(timer.runningSince)) : 0);

/** The timer's fields after pausing at `now` (also used when a stage finishes). */
export const paused = (timer: TimerFields, now: Date): { activeMs: number } => ({
  activeMs: elapsedMs(timer, now),
});
