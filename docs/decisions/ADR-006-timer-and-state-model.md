# ADR-006: Server-side timer as accumulated time + running-since, with action-based endpoints

**Status:** Accepted

## Context
Score = time from Reveal to correct, with pauses while the GM reviews photos/video calls and resumes after a declined photo. Clients are on flaky mobile connections and must not be able to influence timing.

## Decision
- Each team-stage stores `activeMs` and `runningSince`; elapsed = `activeMs + (now - runningSince)`. Pausing folds the running time into `activeMs`.
- A `status` field (`clue`, `revealed`, `awaiting_review`, `completed`, `skipped`) drives what the client shows.
- One record per team per stage, plus an attempt log, so history is preserved for results, map and GM overrides.
- Endpoints are game actions (`reveal`, `answer`, `hint`, `skip`, `photo`, `video-call`), never generic field updates. Lambdas enforce the rules.
- All writes are conditional on current status; stage completion uses a DynamoDB transaction.

## Consequences
- Exact, auditable timing with pauses; retries and double taps are harmless.
- Client timer is display only and re-syncs from the server.
