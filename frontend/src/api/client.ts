import type { z } from 'zod';
import {
  errorResponseSchema,
  healthResponseSchema,
  photoConfirmResponseSchema,
  photoUploadResponseSchema,
  registerTeamResponseSchema,
  teamStateSchema,
  type ErrorCode,
  type HealthResponse,
  type PhotoConfirmResponse,
  type PhotoUploadResponse,
  type RegisterTeamRequest,
  type RegisterTeamResponse,
  type TeamState,
} from '@treasurehunt/shared';
import { getAccessToken } from '../auth/index.js';
import { config } from '../config.js';

// Typed client for every endpoint (docs/05-api-contract.md).

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | 'NETWORK',
    message: string,
  ) {
    super(message);
  }
}

const NETWORK_RETRIES = 2;

const send = async (path: string, init: RequestInit): Promise<Response> => {
  if (!config.apiUrl) throw new ApiError('INTERNAL', 'VITE_API_URL is not set');
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(`${config.apiUrl}${path}`, init);
    } catch {
      // Flaky outdoor signal: retry, then give up with a clear message.
      if (attempt >= NETWORK_RETRIES) {
        throw new ApiError('NETWORK', 'No connection. Check your signal and try again.');
      }
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
};

const request = async <T extends z.ZodType>(
  method: 'GET' | 'POST',
  path: string,
  schema: T,
  { body, auth = true }: { body?: unknown; auth?: boolean } = {},
): Promise<z.infer<T>> => {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth) {
    const token = await getAccessToken();
    if (!token) throw new ApiError('UNAUTHENTICATED', 'Please sign in again');
    headers.authorization = `Bearer ${token}`;
  }

  const res = await send(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(json);
    if (parsed.success) throw new ApiError(parsed.data.error.code, parsed.data.error.message);
    if (res.status === 401) throw new ApiError('UNAUTHENTICATED', 'Please sign in again');
    throw new ApiError('INTERNAL', `Something went wrong (${res.status})`);
  }
  return schema.parse(json);
};

export const getHealth = (): Promise<HealthResponse> =>
  request('GET', '/health', healthResponseSchema, { auth: false });

export const registerTeam = (body: RegisterTeamRequest): Promise<RegisterTeamResponse> =>
  request('POST', '/teams', registerTeamResponseSchema, { body, auth: false });

export const getPhotoUpload = (): Promise<PhotoUploadResponse> =>
  request('POST', '/teams/me/photo-upload', photoUploadResponseSchema);

export const confirmPhoto = (key: string): Promise<PhotoConfirmResponse> =>
  request('POST', '/teams/me/photo-confirm', photoConfirmResponseSchema, { body: { key } });

export const getState = (): Promise<TeamState> =>
  request('GET', '/teams/me/state', teamStateSchema);

/** Uploads a file straight to S3 with a pre-signed POST (ADR-005). */
export const uploadToS3 = async (upload: PhotoUploadResponse, file: Blob): Promise<void> => {
  const form = new FormData();
  for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
  form.append('file', file);
  let res: Response;
  try {
    res = await fetch(upload.url, { method: 'POST', body: form });
  } catch {
    throw new ApiError('NETWORK', 'Upload failed. Check your signal and try again.');
  }
  if (!res.ok) throw new ApiError('INTERNAL', `Upload failed (${res.status})`);
};
