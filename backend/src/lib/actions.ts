import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  currentStageOf,
  getGameStatus,
  loadTeam,
  type StageItem,
  type TeamRecord,
} from './game.js';
import { AppError } from './http.js';

// Shared steps for the team action endpoints.

export type ActionContext = { record: TeamRecord; stage: StageItem };

/**
 * Loads the caller's team and current stage for an action on `stage`.
 * Returns undefined when the team has already moved past that stage (a late retry), so the
 * handler can answer with the current state instead of acting.
 */
export const loadForAction = async (
  teamId: string,
  stage: number,
): Promise<ActionContext | undefined> => {
  const [gameStatus, record] = await Promise.all([getGameStatus(), loadTeam(teamId)]);
  if (gameStatus !== 'live') throw new AppError('GAME_NOT_LIVE', 'The game is not running');
  const { profile } = record;
  if (profile.status === 'finished' || stage < profile.currentStage) return undefined;
  if (profile.status !== 'playing' || stage > profile.currentStage) {
    throw new AppError('INVALID_STATE', 'That stage is not open yet');
  }
  const current = currentStageOf(record);
  if (!current) throw new AppError('INVALID_STATE', 'That stage is not open yet');
  return { record, stage: current };
};

/** A write lost a race with another request (retry/double tap): the caller returns current state. */
export const isLostRace = (err: unknown): boolean =>
  err instanceof ConditionalCheckFailedException || err instanceof TransactionCanceledException;
