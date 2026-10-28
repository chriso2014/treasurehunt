import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { AdminTeam } from '@treasurehunt/shared';
import { db } from './aws.js';
import { config } from './config.js';
import { currentStageOf, groupTeams, type TeamRecord } from './game.js';
import { elapsedMs } from './timer.js';

// Ranking for the GM leaderboard and the public results (docs/02 "Scoring").

/** Every team with its stages and attempts: one Scan, fine for ~5 teams. */
export const loadAllTeams = async (): Promise<TeamRecord[]> => {
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(
      new ScanCommand({
        TableName: config.gameTable,
        ExclusiveStartKey: startKey,
        ConsistentRead: true,
      }),
    );
    items.push(...(page.Items ?? []));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return groupTeams(items);
};

/** Finished stages plus the current one so far, penalties included. */
export const totalMsOf = (record: TeamRecord, now: Date): number => {
  const { profile } = record;
  const current = profile.status === 'playing' ? currentStageOf(record) : undefined;
  const currentMs = current ? elapsedMs(current, now) + current.penaltyMs : 0;
  return profile.totalActiveMs + profile.totalPenaltyMs + currentMs;
};

export type Ranked = { record: TeamRecord; totalMs: number; rank: number | null };

const statusOrder = { finished: 0, playing: 1, registered: 2 } as const;

/**
 * Finished teams first, lowest total wins; equal totals follow the GM's tie-break order.
 * Playing teams follow (furthest along first), then teams that haven't started.
 */
export const rankTeams = (
  records: TeamRecord[],
  tieBreakOrder: string[] | undefined,
  now: Date,
): Ranked[] => {
  const tieIndex = (teamId: string) => {
    const i = tieBreakOrder?.indexOf(teamId) ?? -1;
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const rows = records.map((record) => ({ record, totalMs: totalMsOf(record, now) }));
  rows.sort((a, b) => {
    const pa = a.record.profile;
    const pb = b.record.profile;
    return (
      statusOrder[pa.status] - statusOrder[pb.status] ||
      (pa.status === 'playing' ? pb.currentStage - pa.currentStage : 0) ||
      a.totalMs - b.totalMs ||
      tieIndex(pa.teamId) - tieIndex(pb.teamId) ||
      pa.name.localeCompare(pb.name)
    );
  });
  let rank = 0;
  return rows.map((row) => ({
    ...row,
    rank: row.record.profile.status === 'finished' ? ++rank : null,
  }));
};

/** Wrong free-text answers on the team's open stage: what the GM can accept. */
export const acceptableAnswers = (record: TeamRecord): AdminTeam['wrongAnswers'] => {
  const current = record.profile.status === 'playing' ? currentStageOf(record) : undefined;
  if (!current || current.status !== 'revealed') return [];
  return record.attempts
    .filter((a) => a.stage === current.stage && a.type === 'free_text' && a.result === 'wrong')
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    .map((a) => ({
      attemptId: a.attemptId,
      stage: a.stage,
      text: a.value ?? '',
      submittedAt: a.submittedAt,
    }));
};
