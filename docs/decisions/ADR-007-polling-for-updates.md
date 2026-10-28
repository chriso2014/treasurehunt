# ADR-007: Short polling for live updates (no WebSockets)

**Status:** Accepted. WebSockets were considered and rejected for now as too much effort (connection tracking, auth on connect, mobile reconnects, no `sam local` support).

## Context
Teams waiting for a photo/dance decision, teams waiting for the game to start, and the GM's review queue/leaderboard need to update without a manual refresh. Scale is ~5 teams + 1 GM.

## Decision
Clients poll the HTTP API, only when something could change without them acting:
| Client | When | Endpoint | Interval |
|--------|------|----------|----------|
| Team | game status `registration` (waiting for start) | `GET /teams/me/state` | 5 s |
| Team | stage status `awaiting_review` | `GET /teams/me/state` | 3 s |
| GM | `/admin` open | `GET /admin/reviews`, `GET /admin/teams` | 5 s |

- No polling in other states: the team's own actions return the updated `state`.
- Polling pauses when the page is hidden and re-fetches immediately on `visibilitychange` (screen wake) and when the network comes back (`online` event).
- Polling lives in one small client module so it could be swapped for WebSockets later without touching screens.

## Consequences
- No extra infrastructure; works with `sam local`.
- Up to ~3–5 s delay for review results and game start, which is acceptable.
- Request volume is trivial (a few thousand requests over the event).
