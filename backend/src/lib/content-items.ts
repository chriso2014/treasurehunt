import type { GameContent } from '@treasurehunt/shared';

// Turns a validated content file into Content table items (docs/04-data-model.md).

export type ContentKey = { PK: string; SK: string };
export type ContentItem = ContentKey & Record<string, unknown>;

export const contentToItems = (content: GameContent): ContentItem[] => [
  { PK: 'CONFIG', SK: 'CONFIG', ...content.config },
  { PK: 'ROUTE#A', SK: 'ROUTE', questionIds: content.routes.A },
  { PK: 'ROUTE#B', SK: 'ROUTE', questionIds: content.routes.B },
  ...content.questions.map((q) => ({ PK: `QUESTION#${q.id}`, SK: 'QUESTION', ...q })),
];

/** Keys currently in the table that the new content no longer has (to delete). */
export const staleKeys = (existing: ContentKey[], items: ContentKey[]): ContentKey[] => {
  const keep = new Set(items.map((i) => `${i.PK}|${i.SK}`));
  return existing.filter((k) => !keep.has(`${k.PK}|${k.SK}`));
};
