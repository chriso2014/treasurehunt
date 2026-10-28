import type { StartGameResponse } from '@treasurehunt/shared';
import { requireGamemaster, type AuthedEvent } from '../../lib/auth.js';
import { clock } from '../../lib/clock.js';
import { json, route } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';
import { startGame } from '../../lib/start.js';

// POST /admin/game/start. Game master only. Idempotent.
export const handler = route(async (event: AuthedEvent) => {
  requireGamemaster(event);
  const teamsStarted = await startGame(clock.now());
  logger.info('game started', { action: 'start', teamsStarted });
  const body: StartGameResponse = { status: 'live', teamsStarted };
  return json(200, body);
});
