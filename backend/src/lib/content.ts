import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { GameContent, Question, RouteName } from '@treasurehunt/shared';
import { db } from './aws.js';
import { config } from './config.js';

// Read-only game content (loaded by the seed). Cached briefly per Lambda container, so a re-seed
// shows up within a minute.

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

const getItem = async <T>(PK: string, SK: string): Promise<T> => {
  const key = `${PK}|${SK}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const res = await db.send(new GetCommand({ TableName: config.contentTable, Key: { PK, SK } }));
  if (!res.Item) throw new Error(`Content item ${key} missing: has the content been seeded?`);
  cache.set(key, { at: Date.now(), value: res.Item });
  return res.Item as T;
};

export const getContentConfig = () => getItem<GameContent['config']>('CONFIG', 'CONFIG');

export const getRoute = async (route: RouteName): Promise<string[]> =>
  (await getItem<{ questionIds: string[] }>(`ROUTE#${route}`, 'ROUTE')).questionIds;

export const getQuestion = (id: string) => getItem<Question>(`QUESTION#${id}`, 'QUESTION');

export type PenaltyKind = 'wrong' | 'hint' | 'skip' | 'declined';

export const penaltyFor = (
  kind: PenaltyKind,
  question: Question,
  contentConfig: GameContent['config'],
): number => question.penaltyMs?.[kind] ?? contentConfig.defaultPenaltyMs;

export const clearContentCache = () => cache.clear();
