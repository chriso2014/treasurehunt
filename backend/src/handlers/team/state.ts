import type { TeamState } from '@treasurehunt/shared';
import { teamIdFrom, type AuthedEvent } from '../../lib/auth.js';
import { getGameStatus, getTeam } from '../../lib/game.js';
import { json, route } from '../../lib/http.js';
import { viewUrl } from '../../lib/s3.js';

// GET /teams/me/state. Side-effect free; polled while waiting for the start (ADR-007).
export const handler = route(async (event: AuthedEvent) => {
  const teamId = teamIdFrom(event);
  const [team, gameStatus] = await Promise.all([getTeam(teamId), getGameStatus()]);

  const body: TeamState = {
    game: { status: gameStatus },
    team: {
      name: team.name,
      route: team.route,
      status: team.status,
      photoUrl: team.photoKey ? await viewUrl(team.photoKey) : null,
    },
    current: null,
    completedLocations: [],
  };
  return json(200, body);
});
