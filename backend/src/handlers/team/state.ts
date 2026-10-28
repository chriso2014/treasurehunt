import { teamIdFrom, type AuthedEvent } from '../../lib/auth.js';
import { json, route } from '../../lib/http.js';
import { loadState } from '../../lib/state.js';

// GET /teams/me/state. Side-effect free; polled while waiting for the start (ADR-007).
export const handler = route(async (event: AuthedEvent) =>
  json(200, await loadState(teamIdFrom(event))),
);
