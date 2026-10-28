import type { TeamState } from '@treasurehunt/shared';

// Applying a new `state` from a poll or an action response (ADR-007).

/** Signed image URLs last 15 min (backend/src/lib/s3.ts); reuse them for 10, then take fresh ones. */
export const IMAGE_URL_REUSE_MS = 10 * 60_000;

const samePath = (a: string | null | undefined, b: string | null): a is string =>
  !!a && !!b && a.split('?')[0] === b.split('?')[0];
const keep = (prev: string | null | undefined, next: string | null) =>
  samePath(prev, next) ? prev : next;

/**
 * Each state carries freshly signed image URLs, so an unchanged image would download again on
 * every poll. Keep the URL already on screen when it points at the same object.
 */
export const keepImageUrls = (prev: TeamState, next: TeamState): TeamState => {
  const p = prev.current;
  const c = next.current;
  return {
    ...next,
    team: { ...next.team, photoUrl: keep(prev.team.photoUrl, next.team.photoUrl) },
    current: c && {
      ...c,
      clue: { ...c.clue, imageUrl: keep(p?.clue.imageUrl, c.clue.imageUrl) },
      question: c.question && {
        ...c.question,
        imageUrl: keep(p?.question?.imageUrl, c.question.imageUrl),
      },
      hint: c.hint && { ...c.hint, imageUrl: keep(p?.hint?.imageUrl, c.hint.imageUrl) },
    },
  };
};
