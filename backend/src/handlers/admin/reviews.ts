import type { AdminReviewsResponse } from '@treasurehunt/shared';
import { requireGamemaster, type AuthedEvent } from '../../lib/auth.js';
import { getQuestion } from '../../lib/content.js';
import { json, route } from '../../lib/http.js';
import { listPendingReviews } from '../../lib/review.js';
import { viewUrl } from '../../lib/s3.js';

// GET /admin/reviews. Photos and dance calls waiting for the GM, oldest first. Read only.
export const handler = route(async (event: AuthedEvent) => {
  requireGamemaster(event);
  const pending = await listPendingReviews();
  const body: AdminReviewsResponse = {
    reviews: await Promise.all(
      pending.map(async (p) => ({
        teamId: p.teamId,
        teamName: p.teamName,
        stage: p.stage,
        attemptId: p.attemptId,
        type: p.type === 'photo' ? ('photo' as const) : ('video_call' as const),
        questionText: (await getQuestion(p.questionId)).question.text,
        photoUrl: p.photoKey ? await viewUrl(p.photoKey) : null,
        submittedAt: p.submittedAt,
      })),
    ),
  };
  return json(200, body);
});
