import type { AdminActionResponse } from '@treasurehunt/shared';
import { acceptAnswer } from '../../lib/admin.js';
import { requireGamemaster, type AuthedEvent } from '../../lib/auth.js';
import { clock } from '../../lib/clock.js';
import { json, pathParam, route } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';

// POST /admin/attempts/{teamId}/{attemptId}/accept. Accept a wrong text answer.
export const handler = route(async (event: AuthedEvent) => {
  requireGamemaster(event);
  const teamId = pathParam(event, 'teamId');
  const attemptId = pathParam(event, 'attemptId');
  const applied = await acceptAnswer({ teamId, attemptId, now: clock.now() });
  logger.info('answer accepted', { teamId, attemptId, action: 'accept', applied });
  const body: AdminActionResponse = { applied };
  return json(200, body);
});
