import { tieBreakRequestSchema, type AdminActionResponse } from '@treasurehunt/shared';
import { setTieBreak } from '../../lib/admin.js';
import { requireGamemaster, type AuthedEvent } from '../../lib/auth.js';
import { json, parseBody, route } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';

// POST /admin/game/tie-break { teamIds }. Order for teams with equal totals.
export const handler = route(async (event: AuthedEvent) => {
  requireGamemaster(event);
  const { teamIds } = parseBody(event, tieBreakRequestSchema);
  await setTieBreak(teamIds);
  logger.info('tie-break set', { action: 'tie-break', teams: teamIds.length });
  const body: AdminActionResponse = { applied: true };
  return json(200, body);
});
