import { z } from 'zod';
import { gameStatusSchema, stageStatusSchema, teamStatusSchema } from './state.js';
import { routeNameSchema } from './team.js';

// Game master endpoints (docs/05-api-contract.md "Game master") and the public results page.

export const adminTeamSchema = z.object({
  teamId: z.string(),
  name: z.string(),
  photoUrl: z.string().nullable(),
  route: routeNameSchema,
  status: teamStatusSchema,
  stage: z.number().int(),
  stageCount: z.number().int(),
  /** Current stage's status while playing, else null. */
  stageStatus: stageStatusSchema.nullable(),
  /** Finished stages plus the current one so far, penalties included. */
  totalMs: z.number(),
  timerRunning: z.boolean(),
  /** 1, 2, … for finished teams in final order; null while still playing. */
  rank: z.number().int().nullable(),
  /** Wrong text answers on the current stage, which the GM may accept. */
  wrongAnswers: z.array(
    z.object({
      attemptId: z.string(),
      stage: z.number().int(),
      text: z.string(),
      submittedAt: z.string(),
    }),
  ),
});
export type AdminTeam = z.infer<typeof adminTeamSchema>;

export const adminTeamsResponseSchema = z.object({
  game: z.object({ status: gameStatusSchema, resultsPublished: z.boolean() }),
  /** Finished teams by rank, then playing teams by progress, then registered teams. */
  teams: z.array(adminTeamSchema),
});
export type AdminTeamsResponse = z.infer<typeof adminTeamsResponseSchema>;

export const adminReviewSchema = z.object({
  teamId: z.string(),
  teamName: z.string(),
  stage: z.number().int(),
  attemptId: z.string(),
  type: z.enum(['photo', 'video_call']),
  questionText: z.string(),
  photoUrl: z.string().nullable(),
  submittedAt: z.string(),
});
export type AdminReview = z.infer<typeof adminReviewSchema>;

export const adminReviewsResponseSchema = z.object({ reviews: z.array(adminReviewSchema) });
export type AdminReviewsResponse = z.infer<typeof adminReviewsResponseSchema>;

/** Response of the GM write endpoints: false when it had already been done (a repeated tap). */
export const adminActionResponseSchema = z.object({ applied: z.boolean() });
export type AdminActionResponse = z.infer<typeof adminActionResponseSchema>;

export const setRouteRequestSchema = z.object({ route: routeNameSchema });
export type SetRouteRequest = z.infer<typeof setRouteRequestSchema>;

export const tieBreakRequestSchema = z.object({ teamIds: z.array(z.string().min(1)).max(50) });
export type TieBreakRequest = z.infer<typeof tieBreakRequestSchema>;

export const resultsResponseSchema = z.object({
  title: z.string(),
  teams: z.array(
    z.object({
      rank: z.number().int().nullable(),
      name: z.string(),
      photoUrl: z.string().nullable(),
      totalMs: z.number(),
      finished: z.boolean(),
    }),
  ),
});
export type ResultsResponse = z.infer<typeof resultsResponseSchema>;
