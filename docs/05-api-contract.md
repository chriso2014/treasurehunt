# API Contract (API Gateway HTTP API)

Base: `https://<api-id>.execute-api.eu-west-2.amazonaws.com`.
Auth: `Authorization: Bearer <Cognito access token>` unless marked **public**.
JSON in/out. Errors: `{ "error": { "code": "INVALID_STATE", "message": "..." } }`.

Error codes: `VALIDATION` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `INVALID_STATE` (409, wrong step, e.g. answer before reveal), `TEAM_NAME_TAKEN` (409), `GAME_NOT_LIVE` (409), `INTERNAL` (500, no details). Codes and request/response schemas live in `shared/src/` (zod).

A wrong answer is **not** an error: it returns 200 with `correct: false`.

Every state-changing endpoint returns the updated **`state`** object (below), so the client never has to guess.

## Team: registration
| Method & path | Auth | Body | Returns |
|---------------|------|------|---------|
| `POST /teams` | public | `{ name, password }` | 201 `{ teamId, slug, route }`. 409 `TEAM_NAME_TAKEN` if the slug exists; 409 `INVALID_STATE` once the game has started |
| `POST /teams/me/photo-upload` | team | none | `{ url, fields, key }` (pre-signed POST, 5 min, `image/jpeg`, ≤5 MB, key `teams/{teamId}/team-photo.jpg`). Only before the game starts |
| `POST /teams/me/photo-confirm` | team | `{ key }` | `{ photoUrl }` (15 min). Key must be the caller's own; 400 if the upload hasn't arrived |

## Team: gameplay
| Method & path | Body | Effect |
|---------------|------|--------|
| `GET /teams/me/state` | none | Current screen data (polled while waiting for start or review) |
| `POST /teams/me/current/reveal` | none | `clue` → `revealed`, start timer |
| `POST /teams/me/current/answer` | `{ optionId }` or `{ text }` | Check; wrong: +penalty; correct: complete stage |
| `POST /teams/me/current/hint` | none | +penalty, returns hint (idempotent once used) |
| `POST /teams/me/current/skip` | none | Requires hint used, not on `video_call`; +penalty; next stage |
| `POST /teams/me/current/photo-upload` | none | Pre-signed POST for a submission photo |
| `POST /teams/me/current/photo` | `{ key }` | Pause timer, `awaiting_review`, queue for GM |
| `POST /teams/me/current/video-call` | none | Pause timer, `awaiting_review`, queue for GM; returns WhatsApp link |

### `state` object
```json
{
  "game": { "status": "live" },
  "team": { "name": "The Wanderers", "route": "A", "status": "playing",
            "stage": 3, "stageCount": 8,
            "totalMs": 1830000 },
  "current": {
    "status": "revealed",
    "type": "free_text",
    "clue": { "text": "...", "imageUrl": null },
    "question": { "text": "...", "imageUrl": null, "options": null },
    "hint": null,
    "timer": { "elapsedMs": 95000, "running": true, "serverTime": "2026-...Z" },
    "penaltyMs": 300000, "hintUsed": false, "canSkip": false,
    "lastResult": { "result": "declined", "reason": "Whole team must be in shot" },
    "whatsappUrl": null
  },
  "completedLocations": [ { "name": "...", "lat": 51.95, "lng": -0.28 } ]
}
```
- `team.photoUrl`: pre-signed view URL of the team photo, or null before one is confirmed (the client then asks for a photo).
- Until the game loop exists (phase 4), `current` is `null` and `completedLocations` is empty.
- `question` is null until revealed. `hint` is null until used. Correct answers are never included.
- The client shows a live timer by counting up locally from `elapsedMs`, using `serverTime` to correct clock skew, and re-syncs on every response.

## Game master (provisional, refined in the admin round)
| Method & path | Effect |
|---------------|--------|
| `POST /admin/game/start` | `registration` → `live`; every team gets stage 1 clue |
| `GET /admin/teams` | Leaderboard: teams, stage, totals, status |
| `PUT /admin/teams/{teamId}/route` | Override route (before start only) |
| `GET /admin/reviews` | Pending photo/video submissions (photo pre-signed URLs) |
| `POST /admin/reviews/{teamId}/{attemptSk}` | `{ decision: approved|declined, reason? }` |
| `POST /admin/attempts/{teamId}/{attemptSk}/accept` | Accept a wrong text answer manually |
| `POST /admin/teams/{teamId}/adjust` | `{ stage, deltaMs, note }`: manual time correction (logged) |
| `PUT /admin/game/tie-break` | `{ teamIds: [...] }` |
| `POST /admin/game/publish-results` | Make results public; game `finished` |

## Polling (ADR-007)
- Team: `GET /teams/me/state` every 5 s while the game is in `registration`, every 3 s while `current.status = awaiting_review`.
- GM: `GET /admin/reviews` and `GET /admin/teams` every 5 s while `/admin` is open.
- These GET endpoints must be cheap and side-effect free.

## Public results
| `GET /results` | public | 404 until published; then ranking, team names, photos, totals |
