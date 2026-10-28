import { reviewDecisionSchema, type AdminActionResponse } from '@treasurehunt/shared';
import { requireGamemaster, type AuthedEvent } from '../../lib/auth.js';
import { clock } from '../../lib/clock.js';
import { json, parseBody, pathParam, route } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';
import { applyReview } from '../../lib/review.js';

// POST /admin/reviews/{teamId}/{attemptId} { decision, reason? }.
export const handler = route(async (event: AuthedEvent) => {
  requireGamemaster(event);
  const teamId = pathParam(event, 'teamId');
  const attemptId = pathParam(event, 'attemptId');
  const { decision, reason } = parseBody(event, reviewDecisionSchema);
  const applied = await applyReview({ teamId, attemptId, decision, reason, now: clock.now() });
  logger.info('reviewed', { teamId, attemptId, action: 'review', decision, applied });
  const body: AdminActionResponse = { applied };
  return json(200, body);
});
