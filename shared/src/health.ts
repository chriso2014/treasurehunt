import { z } from 'zod';

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  env: z.string(),
  time: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
