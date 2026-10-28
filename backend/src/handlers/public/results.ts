import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { ResultsResponse } from '@treasurehunt/shared';
import { clock } from '../../lib/clock.js';
import { getContentConfig } from '../../lib/content.js';
import { getGame } from '../../lib/game.js';
import { AppError, json, route } from '../../lib/http.js';
import { loadAllTeams, rankTeams } from '../../lib/leaderboard.js';
import { viewUrl } from '../../lib/s3.js';

// GET /results. Public, 404 until the GM publishes. Only names, photos, ranks and totals.
export const handler = route<APIGatewayProxyEventV2>(async () => {
  const game = await getGame();
  if (game.resultsPublished !== true) throw new AppError('NOT_FOUND', 'Results aren’t out yet');
  const [records, contentConfig] = await Promise.all([loadAllTeams(), getContentConfig()]);
  const ranked = rankTeams(
    records.filter((r) => r.profile.status !== 'registered'),
    game.tieBreakOrder,
    clock.now(),
  );
  const body: ResultsResponse = {
    title: contentConfig.title,
    teams: await Promise.all(
      ranked.map(async ({ record, totalMs, rank }) => ({
        rank,
        name: record.profile.name,
        photoUrl: record.profile.photoKey ? await viewUrl(record.profile.photoKey) : null,
        totalMs,
        finished: record.profile.status === 'finished',
      })),
    ),
  };
  return json(200, body);
});
