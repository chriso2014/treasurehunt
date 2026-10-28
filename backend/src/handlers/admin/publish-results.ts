import type { AdminActionResponse } from '@treasurehunt/shared';
import { publishResults } from '../../lib/admin.js';
import { requireGamemaster, type AuthedEvent } from '../../lib/auth.js';
import { clock } from '../../lib/clock.js';
import { json, route } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';

// POST /admin/game/publish-results. Ends the game and opens /results. Safe to repeat.
export const handler = route(async (event: AuthedEvent) => {
  requireGamemaster(event);
  await publishResults(clock.now());
  logger.info('results published', { action: 'publish' });
  const body: AdminActionResponse = { applied: true };
  return json(200, body);
});
