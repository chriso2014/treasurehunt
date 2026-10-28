import { setRouteRequestSchema, type AdminActionResponse } from '@treasurehunt/shared';
import { setRoute } from '../../lib/admin.js';
import { requireGamemaster, type AuthedEvent } from '../../lib/auth.js';
import { json, parseBody, pathParam, route } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';

// POST /admin/teams/{teamId}/route { route }. Before the game starts only.
export const handler = route(async (event: AuthedEvent) => {
  requireGamemaster(event);
  const teamId = pathParam(event, 'teamId');
  const { route: newRoute } = parseBody(event, setRouteRequestSchema);
  await setRoute(teamId, newRoute);
  logger.info('route set', { teamId, action: 'set-route', route: newRoute });
  const body: AdminActionResponse = { applied: true };
  return json(200, body);
});
