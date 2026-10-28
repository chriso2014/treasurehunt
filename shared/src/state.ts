import { z } from 'zod';
import { routeNameSchema } from './team.js';

// The `state` object returned by GET /teams/me/state and every action (docs/05-api-contract.md).
// Phase 3 covers registration and waiting; `current` is filled in by the game loop (phase 4).

export const gameStatusSchema = z.enum(['registration', 'live', 'finished']);
export type GameStatus = z.infer<typeof gameStatusSchema>;

export const teamStatusSchema = z.enum(['registered', 'playing', 'finished']);
export type TeamStatus = z.infer<typeof teamStatusSchema>;

export const teamStateSchema = z.object({
  game: z.object({ status: gameStatusSchema }),
  team: z.object({
    name: z.string(),
    route: routeNameSchema,
    status: teamStatusSchema,
    photoUrl: z.string().nullable(),
  }),
  current: z.null(),
  completedLocations: z.array(z.object({ name: z.string(), lat: z.number(), lng: z.number() })),
});
export type TeamState = z.infer<typeof teamStateSchema>;
