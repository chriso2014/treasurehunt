import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { GameStatus, RouteName, TeamStatus } from '@treasurehunt/shared';
import { db } from './aws.js';
import { config } from './config.js';
import { AppError } from './http.js';

// Game table items (docs/04-data-model.md).

export const GAME_KEY = { PK: 'GAME', SK: 'STATE' } as const;
export const teamKey = (teamId: string) => ({ PK: `TEAM#${teamId}`, SK: 'PROFILE' });

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
