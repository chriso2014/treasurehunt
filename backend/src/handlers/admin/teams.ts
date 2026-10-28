import type { AdminTeamsResponse } from '@treasurehunt/shared';
import { requireGamemaster, type AuthedEvent } from '../../lib/auth.js';
import { clock } from '../../lib/clock.js';
import { getRoute } from '../../lib/content.js';
import { currentStageOf, getGame } from '../../lib/game.js';
import { json, route } from '../../lib/http.js';
import { acceptableAnswers, loadAllTeams, rankTeams } from '../../lib/leaderboard.js';
import { viewUrl } from '../../lib/s3.js';

// GET /admin/teams. The GM leaderboard, polled every 5 s while /admin is open. Read only.
export const handler = route(async (event: AuthedEvent) => {
  requireGamemaster(event);
  const [game, records, routeA, routeB] = await Promise.all([
    getGame(),
    loadAllTeams(),
    getRoute('A'),
    getRoute('B'),
  ]);
  const stageCount = { A: routeA.length, B: routeB.length };
  const ranked = rankTeams(records, game.tieBreakOrder, clock.now());

  const body: AdminTeamsResponse = {
    game: { status: game.status, resultsPublished: game.resultsPublished === true },
    teams: await Promise.all(
      ranked.map(async ({ record, totalMs, rank }) => {
        const { profile } = record;
        const current = profile.status === 'playing' ? currentStageOf(record) : undefined;
        return {
          teamId: profile.teamId,
          name: profile.name,
          photoUrl: profile.photoKey ? await viewUrl(profile.photoKey) : null,
          route: profile.route,
          status: profile.status,
          stage: profile.currentStage,
          stageCount: stageCount[profile.route],
          stageStatus: current?.status ?? null,
          totalMs,
          timerRunning: current?.runningSince !== undefined,
          rank,
          wrongAnswers: acceptableAnswers(record),
        };
      }),
    ),
  };
  return json(200, body);
});
