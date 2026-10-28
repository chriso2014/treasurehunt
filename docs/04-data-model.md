# Data Model (DynamoDB)

Two tables: **Content** (what the game is, loaded from a seed file) and **Game** (what is happening, written by Lambdas). Both use generic `PK` / `SK` string keys, on-demand capacity, and point-in-time recovery on.

Conventions:
- Timestamps: ISO 8601 UTC strings, **always set by the server**.
- Durations: integer **milliseconds** (`...Ms`). Displayed as mm:ss.
- Stage numbers: 1-based, zero-padded in keys (`STAGE#03`).

## Content table
Loaded by `npm run seed` from `content/game.private.json` (gitignored). Read-only to the game Lambdas.

| PK | SK | Attributes |
|----|----|-----------|
| `CONFIG` | `CONFIG` | `title`, `defaultPenaltyMs` (300000), `map: { centre: {lat, lng}, zoom }` (default view before any location is completed) |
| `ROUTE#A` | `ROUTE` | `questionIds`: ordered list, last item is the dance question |
| `ROUTE#B` | `ROUTE` | `questionIds`: same set as A, different order |
| `QUESTION#<id>` | `QUESTION` | see below |

Question item:
```
id, type: multiple_choice | free_text | photo | video_call
location:  { name, lat, lng }          // WGS84 decimal degrees, 5 dp (~1 m); e.g. 51.94912, -0.28013
clue:      { text?, imageKey? }          // leads team to the location
question:  { text, imageKey? }           // shown on Reveal
options?:  [{ id, text }]                // multiple_choice
correctOptionId?                          // multiple_choice (never sent to client)
acceptedAnswers?: [string]                // free_text (never sent to client)
matching?: { maxTypos?, ignoreArticles?, contains?: [string], numeric?: { value, tolerance } }
hint:      { text?, imageKey? }          // never sent until requested
penaltyMs?: { wrong?, hint?, skip?, declined? }   // overrides defaultPenaltyMs
```
Images (`imageKey`, e.g. `content/q2-clue.jpg`) live in the private assets bucket under `content/` and are returned as short-lived pre-signed GET URLs. The seed uploads them from `content/images/<name>` (gitignored).

The file is validated by `gameContentSchema` in `shared/src/content.ts` (field types per question type, unknown fields rejected, both routes cover every question once and end with the single `video_call`).

## Game table
| PK | SK | Purpose |
|----|----|---------|
| `GAME` | `STATE` | `status`: `registration` / `live` / `finished`; `startedAt`; `resultsPublished`; `registrationCounter`; `tieBreakOrder?` |
| `TEAM#<teamId>` | `PROFILE` | Team record |
| `TEAM#<teamId>` | `STAGE#<nn>` | One per stage the team has reached |
| `TEAM#<teamId>` | `ATTEMPT#<nn>#<attemptId>` | Every submission (answer, photo, video call). `attemptId` is a UUID the client makes once per submission, so a retry hits the same key and is applied once; order by `submittedAt` |

`teamId` = Cognito `sub`.

### Team profile
```
teamId, name (display), slug (login), photoKey, route: A|B,
status: registered | playing | finished,
currentStage: number,           // index into the route's questionIds
registeredAt, finishedAt?,
totalActiveMs, totalPenaltyMs   // cached running totals of completed stages (for the leaderboard)
```

### Team stage
```
stage: number, questionId,
status: clue | revealed | awaiting_review | completed | skipped,
clueShownAt, revealedAt?, completedAt?,
activeMs: number,               // timer time accumulated while not running
runningSince?: timestamp,       // set while timer is running, removed while paused
wrongAttempts, declines, hintUsed: bool, skipped: bool,
penaltyMs: number,
outcome?: correct | approved | declined | skipped | gm_accepted
```

### Attempt
```
stage, attemptId, questionId, type, submittedAt,
value?        // option id or text
photoKey?     // photo submissions
result: correct | wrong | pending | approved | declined | gm_accepted,
reviewedAt?, reason?
```

## Timer model (ADR-006)
```
elapsedMs = activeMs + (runningSince ? now - runningSince : 0)
stageTotalMs = elapsedMs + penaltyMs
pause:  activeMs += now - runningSince; remove runningSince
resume: runningSince = now
```
| Event | Timer |
|-------|-------|
| Reveal | `runningSince = now` |
| Photo submitted / WhatsApp tapped | pause, status `awaiting_review` |
| Photo declined | penalty; resume; status `revealed` |
| Correct / approved / skipped | pause (final), status `completed`/`skipped` |
| Dance declined | penalty; status `completed` (no retry) |

## Stage transitions (one DynamoDB transaction)
When a stage finishes, `TransactWriteItems`:
1. Update the stage (condition: `status` is the expected current value).
2. Update the team profile: add to `totalActiveMs`/`totalPenaltyMs`; `currentStage += 1` or `status = finished`.
3. Put the next stage item with `status = clue`, `clueShownAt = now` (unless it was the last stage).

Every state-changing write is **conditional on the current status**. That makes double taps and retries on bad signal safe: a repeated request fails the condition and the Lambda returns the current state.

## Access patterns
| Need | How |
|------|-----|
| Team's current state | `Query PK = TEAM#<id>` (profile + stages; small) |
| Content for a question | `GetItem QUESTION#<id>` (cache in Lambda memory) |
| Route order | `GetItem ROUTE#A` / `ROUTE#B` (cache) |
| Leaderboard / all teams | `Scan` Game table filtered to `PROFILE` (≤ 5 teams, fine) |
| Pending review queue | GSI `GSI1` on attempts: `GSI1PK = REVIEW#PENDING`, `GSI1SK = submittedAt`; attribute removed when reviewed (sparse index) |
| Wrong text answers (GM override) | `Query PK = TEAM#<id>, SK begins_with ATTEMPT#` |
