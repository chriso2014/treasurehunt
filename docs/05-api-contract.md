# API Contract (API Gateway HTTP API)

Base: `https://<api-id>.execute-api.eu-west-2.amazonaws.com`.
Auth: `Authorization: Bearer <Cognito access token>` unless marked **public**.
JSON in/out. Errors: `{ "error": { "code": "INVALID_STATE", "message": "..." } }`.

Error codes: `VALIDATION` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `INVALID_STATE` (409, wrong step, e.g. answer before reveal), `TEAM_NAME_TAKEN` (409), `GAME_NOT_LIVE` (409), `INTERNAL` (500, no details). Codes and request/response schemas live in `shared/src/` (zod).

A wrong answer is **not** an error: it returns 200 with `correct: false`.

Every state-changing endpoint returns the updated **`state`** object (below), so the client never has to guess.

Action bodies carry `stage` (the stage the client is acting on): if the team has already moved past it, nothing happens and the current state is returned, so a late retry can't act on the next stage. Submissions also carry `attemptId` (a UUID made once per submission and reused on retries), so a retried answer is counted once.

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
| `POST /teams/me/current/reveal` | `{ stage }` | `clue` → `revealed`, start timer. Returns `state`. Repeating it is harmless |
| `POST /teams/me/current/answer` | `{ stage, attemptId, optionId }` or `{ stage, attemptId, text }` | Check; wrong: +penalty; correct: complete stage. Returns `{ correct, state }`; `correct` is null if the request was a late retry for a stage already finished |
| `POST /teams/me/current/hint` | `{ stage }` | Only while `revealed`: `hintUsed`, +hint penalty (once). Returns `state` with `hint` filled in. Repeating it is harmless |
| `POST /teams/me/current/skip` | `{ stage }` | Requires hint used, status `revealed`, not `video_call` (else 409); +skip penalty, stage `skipped`, next clue. Returns `state`. A late retry returns the current state |
| `POST /teams/me/current/photo-upload` | `{ stage, attemptId }` | Photo question, `revealed` only. `{ url, fields, key }` pre-signed POST (5 min, `image/jpeg`, ≤5 MB) for `teams/{teamId}/submissions/{nn}-{attemptId}.jpg` |
| `POST /teams/me/current/photo` | `{ stage, attemptId }` | After the upload (400 if it hasn't arrived): pending attempt in the review queue, timer paused, `awaiting_review`. Returns `state`. Same `attemptId` again is harmless |
| `POST /teams/me/current/video-call` | `{ stage, attemptId }` | Dance stage, `revealed` only: pending attempt, timer paused, `awaiting_review`. Returns `state`; `current.whatsappUrl` is the `wa.me` link |

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
    "penaltyMs": 300000, "hintPenaltyMs": 300000, "skipPenaltyMs": 300000, "hintUsed": false, "canSkip": false,
    "lastResult": { "result": "declined", "reason": "Whole team must be in shot" },
    "whatsappUrl": null
  },
  "completedLocations": [ { "name": "...", "lat": 51.95, "lng": -0.28 } ],
  "results": [ { "stage": 1, "outcome": "correct", "timeMs": 192000, "penaltyMs": 300000,
                 "penalties": [ { "kind": "wrong", "count": 1, "ms": 300000 } ] } ]
}
```
- `team.photoUrl`: pre-signed view URL of the team photo, or null before one is confirmed (the client then asks for a photo).
- `current` is null before the start and after the team finishes. `current.stage` is the stage number to send with actions.
- `question` is null until revealed. `hint` is null until used. `hintPenaltyMs`/`skipPenaltyMs` are what using the hint or skipping would add, for the confirm dialogs. Correct answers are never included.
- The client shows a live timer by counting up locally from `elapsedMs`, using `serverTime` to correct clock skew, and re-syncs on every response.

## Game master
All require the `gamemaster` group (403 otherwise). Writes are conditional and return `{ applied }`: `false` means it had already been done (a repeated tap).

| Method & path | Body | Effect |
|---------------|------|--------|
| `POST /admin/game/start` | none | `registration` → `live`; every registered team gets its stage 1 clue. Returns `{ status: 'live', teamsStarted }`. Safe to repeat (finishes a partial start). Also `npm run start-game -- <env>` |
| `GET /admin/teams` | none | `{ game: { status, resultsPublished }, teams: [...] }`: name, photo URL, route, status, stage x of y, current stage status, live `totalMs`, `rank` (finished teams only), and `wrongAnswers` (wrong text answers on the open stage, acceptable by the GM). Finished teams by rank, then playing teams by progress, then registered |
| `GET /admin/reviews` | none | `{ reviews: [...] }`: pending photos and dance calls, oldest first, with question text and photo URL |
| `POST /admin/reviews/{teamId}/{attemptId}` | `{ decision: approved\|declined, reason? }` | Approve: stage completes. Decline photo: penalty, timer resumes, team sees the reason. Decline dance: penalty, team finishes. Also `npm run review -- <env>` |
| `POST /admin/attempts/{teamId}/{attemptId}/accept` | none | Accept a wrong text answer on the team's open stage: completes it as `gm_accepted`, timer stops at that answer's submission, its penalty and later wrong-answer penalties on the stage are removed |
| `POST /admin/teams/{teamId}/route` | `{ route: A\|B }` | Route override, only while the team is `registered` (409 after) |
| `POST /admin/game/tie-break` | `{ teamIds: [...] }` | Order for teams with equal totals (earlier = higher) |
| `POST /admin/game/publish-results` | none | Game `finished`, `resultsPublished`; team actions stop (`GAME_NOT_LIVE`); `/results` opens |

Not built (A9, manual time adjustment): add it only if the rehearsal shows a need.

## Polling (ADR-007)
- Team: `GET /teams/me/state` every 5 s while the game is in `registration`, every 3 s while `current.status = awaiting_review`.
- GM: `GET /admin/reviews` and `GET /admin/teams` every 5 s while `/admin` is open.
- These GET endpoints must be cheap and side-effect free.

## Public results
| `GET /results` | public | 404 until published; then `{ title, teams: [{ rank, name, photoUrl, totalMs, finished }] }`. Teams that never started are left out |
