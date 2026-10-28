import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type {
  AttemptResult,
  GameStatus,
  QuestionType,
  RouteName,
  StageStatus,
  TeamStatus,
} from '@treasurehunt/shared';
import { db } from './aws.js';
import { config } from './config.js';
import { AppError } from './http.js';

// Game table items (docs/04-data-model.md).

export const GAME_KEY = { PK: 'GAME', SK: 'STATE' } as const;
export const teamPk = (teamId: string) => `TEAM#${teamId}`;
export const teamKey = (teamId: string) => ({ PK: teamPk(teamId), SK: 'PROFILE' });
const pad = (stage: number) => String(stage).padStart(2, '0');
export const stageKey = (teamId: string, stage: number) => ({
  PK: teamPk(teamId),
  SK: `STAGE#${pad(stage)}`,
});
/** attemptId is made once per submission by the client, so a retried submission has the same key. */
export const attemptKey = (teamId: string, stage: number, attemptId: string) => ({
  PK: teamPk(teamId),
  SK: `ATTEMPT#${pad(stage)}#${attemptId}`,
});

export type TeamProfile = {
  teamId: string;
  name: string;
  slug: string;
  route: RouteName;
  status: TeamStatus;
  currentStage: number;
  registeredAt: string;
  photoKey?: string;
  finishedAt?: string;
  totalActiveMs: number;
  totalPenaltyMs: number;
};

export type StageItem = {
  stage: number;
  questionId: string;
  status: StageStatus;
  clueShownAt: string;
  revealedAt?: string;
  completedAt?: string;
  activeMs: number;
  runningSince?: string;
  wrongAttempts: number;
  declines: number;
  hintUsed: boolean;
  skipped: boolean;
  penaltyMs: number;
  outcome?: 'correct' | 'approved' | 'declined' | 'skipped' | 'gm_accepted';
};

export type AttemptItem = {
  stage: number;
  attemptId: string;
  questionId: string;
  type: QuestionType;
  submittedAt: string;
  value?: string;
  photoKey?: string;
  result: AttemptResult;
  reviewedAt?: string;
  reason?: string;
};

/** The game item is created by the first registration; until then the game is in registration. */
export const getGameStatus = async (): Promise<GameStatus> => {
  const res = await db.send(new GetCommand({ TableName: config.gameTable, Key: GAME_KEY }));
  return (res.Item?.status as GameStatus | undefined) ?? 'registration';
};

export const getTeam = async (teamId: string): Promise<TeamProfile> => {
  const res = await db.send(new GetCommand({ TableName: config.gameTable, Key: teamKey(teamId) }));
  if (!res.Item) throw new AppError('NOT_FOUND', 'Team not found');
  return res.Item as TeamProfile;
};

export type TeamRecord = { profile: TeamProfile; stages: StageItem[]; attempts: AttemptItem[] };

/** Everything stored for one team: one small Query. */
export const loadTeam = async (teamId: string): Promise<TeamRecord> => {
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const res = await db.send(
      new QueryCommand({
        TableName: config.gameTable,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': teamPk(teamId) },
        ExclusiveStartKey: startKey,
        ConsistentRead: true,
      }),
    );
    items.push(...(res.Items ?? []));
    startKey = res.LastEvaluatedKey;
  } while (startKey);

  const profile = items.find((i) => i.SK === 'PROFILE') as TeamProfile | undefined;
  if (!profile) throw new AppError('NOT_FOUND', 'Team not found');
  const startsWith = (prefix: string) =>
    items.filter((i) => typeof i.SK === 'string' && i.SK.startsWith(prefix));
  return {
    profile,
    stages: startsWith('STAGE#') as unknown as StageItem[],
    attempts: startsWith('ATTEMPT#') as unknown as AttemptItem[],
  };
};

export const currentStageOf = (record: TeamRecord): StageItem | undefined =>
  record.stages.find((s) => s.stage === record.profile.currentStage);
