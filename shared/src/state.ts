import { z } from 'zod';
import { routeNameSchema } from './team.js';

// The `state` object returned by GET /teams/me/state and every action (docs/05-api-contract.md).
// It only ever holds what the team has earned: no correct answers, unused hints or upcoming locations.

export const gameStatusSchema = z.enum(['registration', 'live', 'finished']);
export type GameStatus = z.infer<typeof gameStatusSchema>;

export const teamStatusSchema = z.enum(['registered', 'playing', 'finished']);
export type TeamStatus = z.infer<typeof teamStatusSchema>;

export const stageStatusSchema = z.enum([
  'clue',
  'revealed',
  'awaiting_review',
  'completed',
  'skipped',
]);
export type StageStatus = z.infer<typeof stageStatusSchema>;

export const questionTypeSchema = z.enum(['multiple_choice', 'free_text', 'photo', 'video_call']);
export type QuestionType = z.infer<typeof questionTypeSchema>;

export const attemptResultSchema = z.enum([
  'correct',
  'wrong',
  'pending',
  'approved',
  'declined',
  'gm_accepted',
]);
export type AttemptResult = z.infer<typeof attemptResultSchema>;

const shownImage = { imageUrl: z.string().nullable() };

export const currentStageSchema = z.object({
  stage: z.number().int(),
  status: stageStatusSchema,
  type: questionTypeSchema,
  clue: z.object({ text: z.string().nullable(), ...shownImage }),
  /** Null until revealed. */
  question: z
    .object({
      text: z.string(),
      ...shownImage,
      options: z.array(z.object({ id: z.string(), text: z.string() })).nullable(),
    })
    .nullable(),
  /** Null until the hint is used. */
  hint: z.object({ text: z.string().nullable(), ...shownImage }).nullable(),
  timer: z.object({ elapsedMs: z.number(), running: z.boolean(), serverTime: z.string() }),
  penaltyMs: z.number(),
  hintUsed: z.boolean(),
  canSkip: z.boolean(),
  /** Outcome of the latest attempt at this stage, e.g. a wrong answer. */
  lastResult: z.object({ result: attemptResultSchema, reason: z.string().nullable() }).nullable(),
  whatsappUrl: z.string().nullable(),
});
export type CurrentStage = z.infer<typeof currentStageSchema>;

export const teamStateSchema = z.object({
  game: z.object({ status: gameStatusSchema }),
  team: z.object({
    name: z.string(),
    route: routeNameSchema,
    status: teamStatusSchema,
    photoUrl: z.string().nullable(),
    stage: z.number().int(),
    stageCount: z.number().int(),
    /** Completed stages plus the current stage so far, penalties included. */
    totalMs: z.number(),
  }),
  /** Null before the start and after finishing. */
  current: currentStageSchema.nullable(),
  completedLocations: z.array(z.object({ name: z.string(), lat: z.number(), lng: z.number() })),
});
export type TeamState = z.infer<typeof teamStateSchema>;
