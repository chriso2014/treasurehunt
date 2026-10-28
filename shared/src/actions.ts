import { z } from 'zod';
import { teamStateSchema } from './state.js';

// Request/response shapes for the gameplay action endpoints (docs/05-api-contract.md).
// `stage` says which stage the client is acting on, so a retry that arrives after the team has
// moved on is ignored instead of hitting the next stage. `attemptId` (a UUID made once per
// submission) makes a retried answer count once.

const stage = z.number().int().min(1);

export const revealRequestSchema = z.object({ stage });
export type RevealRequest = z.infer<typeof revealRequestSchema>;

export const hintRequestSchema = z.object({ stage });
export type HintRequest = z.infer<typeof hintRequestSchema>;

export const skipRequestSchema = z.object({ stage });
export type SkipRequest = z.infer<typeof skipRequestSchema>;

/** Photo upload, photo submission and dance call: one attemptId per submission. */
export const submissionRequestSchema = z.object({ stage, attemptId: z.uuid() });
export type SubmissionRequest = z.infer<typeof submissionRequestSchema>;

/** GM decision on a pending photo or dance (scripts/review.ts now, /admin in phase 7). */
export const reviewDecisionSchema = z.object({
  decision: z.enum(['approved', 'declined']),
  reason: z.string().trim().max(200).optional(),
});
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

export const answerRequestSchema = z.union([
  z.object({ stage, attemptId: z.uuid(), optionId: z.string().min(1) }),
  z.object({ stage, attemptId: z.uuid(), text: z.string().trim().min(1).max(200) }),
]);
export type AnswerRequest = z.infer<typeof answerRequestSchema>;

export const answerResponseSchema = z.object({
  /** null when the answer was not checked because the team had already moved on. */
  correct: z.boolean().nullable(),
  state: teamStateSchema,
});
export type AnswerResponse = z.infer<typeof answerResponseSchema>;

export const startGameResponseSchema = z.object({
  status: z.literal('live'),
  teamsStarted: z.number().int(),
});
export type StartGameResponse = z.infer<typeof startGameResponseSchema>;
