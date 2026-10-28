import { ApiError } from '../api/client.js';
import { SignInError } from '../auth/index.js';

/** A message a team can act on, for any error from the API, upload or sign-in. */
export const errorText = (err: unknown): string =>
  err instanceof ApiError || err instanceof SignInError
    ? err.message
    : 'Something went wrong. Please try again.';
