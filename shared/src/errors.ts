import { z } from 'zod';

// Error format and codes from docs/05-api-contract.md.

export const errorCodeSchema = z.enum([
  'VALIDATION',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID_STATE',
  'TEAM_NAME_TAKEN',
  'GAME_NOT_LIVE',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorResponseSchema = z.object({
  error: z.object({ code: errorCodeSchema, message: z.string() }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
