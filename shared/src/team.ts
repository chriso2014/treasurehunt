import { z } from 'zod';

// Team registration rules and API shapes (docs/03-architecture.md "Sign-up flow", docs/05-api-contract.md).

/**
 * Login username for a team name: lowercase, accents stripped, spaces to `-`, other characters dropped.
 * The sign-in form applies the same rule to the typed name (ADR-004).
 */
export const teamSlug = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

export const teamNameSchema = z
  .string()
  .trim()
  .min(2, 'Team name must be at least 2 characters')
  .max(30, 'Team name must be at most 30 characters')
  .regex(/^[\p{L}\p{N} '&!.,-]+$/u, 'Use letters, numbers, spaces and simple punctuation only')
  .refine((name) => teamSlug(name).length >= 2, 'Team name needs at least 2 letters or numbers');

// Matches the Cognito password policy in backend/template.yaml.
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(64, 'Password must be at most 64 characters');

export const routeNameSchema = z.enum(['A', 'B']);

export const registerTeamRequestSchema = z.object({
  name: teamNameSchema,
  password: passwordSchema,
});
export type RegisterTeamRequest = z.infer<typeof registerTeamRequestSchema>;

export const registerTeamResponseSchema = z.object({
  teamId: z.string(),
  slug: z.string(),
  route: routeNameSchema,
});
export type RegisterTeamResponse = z.infer<typeof registerTeamResponseSchema>;

export const photoUploadResponseSchema = z.object({
  url: z.string(),
  fields: z.record(z.string(), z.string()),
  key: z.string(),
});
export type PhotoUploadResponse = z.infer<typeof photoUploadResponseSchema>;

export const photoConfirmRequestSchema = z.object({ key: z.string().min(1) });
export type PhotoConfirmRequest = z.infer<typeof photoConfirmRequestSchema>;

export const photoConfirmResponseSchema = z.object({ photoUrl: z.string() });
export type PhotoConfirmResponse = z.infer<typeof photoConfirmResponseSchema>;

/** Max team photo upload size; the browser resizes to ≤1600px JPEG (~300–500 KB) first. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const teamPhotoKey = (teamId: string): string => `teams/${teamId}/team-photo.jpg`;
