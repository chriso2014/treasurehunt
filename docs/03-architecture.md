# Architecture

> Status: **architecture agreed** (sign-up, content, gameplay, live updates, map, admin).

## Principles
- **Exclusively AWS serverless.** No EC2, no servers to patch.
- Frontend and backend live in one repo and deploy **separately** with AWS SAM (ADR-001).
- **Backend is the source of truth**: timing, answer checking, scoring.
- **One DynamoDB-backed data layer** for content and game state (ADR-003).
- Keep it simple: built for one event with ~5 teams and 1 game master.

## Region
All resources in **eu-west-2 (London)**. CloudFront is global; a custom-domain certificate for it would need to be issued in us-east-1.

## Components
| Component | Service | Purpose |
|-----------|---------|---------|
| Frontend SPA | Built with Node.js; static files in **S3**, served by **CloudFront** (HTTPS) | Team app + GM admin console (ADR-002) |
| API | **Amazon API Gateway HTTP API** with **JWT authorizer** (Cognito) | All client to backend traffic (ADR-005) |
| Business logic | **AWS Lambda** (Node.js) | Registration, game flow, answer checking, admin |
| Auth | **Amazon Cognito User Pool** | Team login (team name + password); GM login in `gamemaster` group (ADR-004) |
| Data | **Amazon DynamoDB**: `Content` + `Game` tables | Content loaded from a seed file; game state written by Lambdas (ADR-003, `docs/04-data-model.md`) |
| Files | **Amazon S3** (private bucket) | Team photos and photo-question submissions; accessed only via pre-signed URLs |
| Config | **SSM Parameter Store** | GM WhatsApp number, penalty defaults, cross-stack values (API URL, User Pool IDs) |
| Live updates | **Short polling** of the HTTP API | Waiting-for-start, review results, GM queue/leaderboard (ADR-007) |
| Map | **Leaflet + OpenStreetMap** | Completed locations only (ADR-008) |

## High-level flow
```
Phone browser ──HTTPS──> CloudFront ──> S3 (SPA static files)
      │
      ├──HTTPS + Authorization: Bearer <Cognito token>──> API Gateway (HTTP API, JWT authorizer) ──> Lambda ──> DynamoDB
      │                                                                                             └──> S3 (pre-signed URLs)
      ├──> Cognito User Pool (sign in, refresh tokens)
      └──PUT/POST via pre-signed URL──> S3 (photos, direct upload)
```

## Sign-up flow (agreed)
Team-facing fields: **team name**, **password**, **team photo** (taken with the phone camera). No phone number for now.

1. **Enter details.** The SPA collects team name and password and calls the public endpoint `POST /teams`.
2. **Create team (Lambda `registerTeam`).**
   - Validate the team name (length, allowed characters) and password (meets User Pool policy).
   - Derive a **login username** from the team name: lowercase, trim, spaces to `-`, strip other characters (Cognito usernames cannot contain spaces). The display name is kept as typed.
   - `AdminCreateUser` (message suppressed) + `AdminSetUserPassword` (permanent). No email or SMS verification. Cognito rejects duplicates (`UsernameExistsException`), which enforces unique team names.
   - Create the team item in DynamoDB keyed by the Cognito `sub` (= `teamId`), with display name, slug and status `registered`.
   - **Assign route** by atomically incrementing a registration counter (`UpdateItem ADD`): odd → route A, even → route B.
   - If the DynamoDB write fails, delete the Cognito user (no half-created teams).
3. **Sign in.** The SPA signs in to Cognito with the slug + password and receives ID, access and refresh tokens. Later requests send the access token in the `Authorization: Bearer` header.
4. **Take photo.** The SPA opens the camera (`<input type="file" accept="image/*" capture="user">`, front camera for a team selfie). The image is resized in the browser to ≤1600px and re-encoded as JPEG (~300–500 KB).
5. **Get upload URL.** `POST /teams/me/photo-upload` → Lambda returns a **pre-signed S3 POST** for key `teams/{teamId}/team-photo.jpg`, valid for ~5 minutes, restricted to `image/jpeg` and a max size (e.g. 5 MB, `content-length-range`).
6. **Upload.** The browser uploads directly to S3.
7. **Confirm.** `POST /teams/me/photo-confirm` → Lambda checks the object exists (`HeadObject`) and stores the S3 key on the team item. The team can retake/re-upload until the game starts.
8. **Waiting screen** until the GM starts the game.

### Returning to the app / session
- Tokens are held by the auth client library and **refreshed automatically** with the refresh token, so a reloaded tab or reopened browser stays signed in for the whole event.
- Designed for **one device per team**. Signing in on another device (e.g. a flat battery) continues the same game, since all state is on the server.

## Content loading (agreed)
- Real content is written in `content/game.private.json` (**gitignored**, as the repo is public). `content/game.example.json` shows the shape.
- `npm run seed` validates the file and writes it to the `Content` table (replacing existing items); clue/question images are uploaded to the assets bucket under `content/`.
- No content-editing UI: edit the file and re-run the seed.

## Gameplay (agreed)
- State per team: a **profile** (route, current stage, status, cached totals), one **stage record** per stage reached (status + timer fields + penalties), and an **attempt log**. See `docs/04-data-model.md`.
- The client calls **action endpoints** (`reveal`, `answer`, `hint`, `skip`, `photo`, `video-call`) and `GET /teams/me/state`. See `docs/05-api-contract.md`.
- Each action is a small Lambda (or one router Lambda per area) that loads state, checks the rule, and writes conditionally. Stage completion is a DynamoDB transaction.
- Timer: `activeMs` + `runningSince` (ADR-006). Server time only; the client displays a ticking timer re-synced from each response.
- Answer checking (`multiple_choice`, `free_text` matching rules in `docs/02-domain-and-glossary.md`) runs in a pure, unit-tested module.

## GM review flow: photo and dance (agreed, ADR-009)
Direct API + DynamoDB; no Step Functions.

1. **Submit.** Photo: the client resizes and uploads to S3 (`teams/{teamId}/submissions/{stage}-{timestamp}.jpg`) via pre-signed POST, then `POST /teams/me/current/photo {key}`. Dance: the team taps the WhatsApp button, which calls `POST /teams/me/current/video-call` and then opens `https://wa.me/<GM number>`.
2. **Pause.** Lambda, in one conditional write (status must be `revealed`): `activeMs += now - runningSince`, remove `runningSince`, status → `awaiting_review`, put a `pending` attempt (appears in the `REVIEW#PENDING` GSI).
3. **Team waits.** "Waiting for game master…" with frozen timer; polls `GET /teams/me/state` every 3 s.
4. **GM reviews.** `/admin` polls `GET /admin/reviews` every 5 s; shows team, question text and the photo (pre-signed GET) or "dance call". GM taps Approve, or Decline with an optional reason.
5. **Apply decision.** `POST /admin/reviews/{teamId}/{attemptSk}` (condition: attempt is `pending`, stage is `awaiting_review`):
   - Photo **approved** / dance **approved**: transaction completes the stage (outcome `approved`), updates team totals, creates the next stage's `clue` or marks the team `finished`.
   - Photo **declined**: +penalty, `runningSince = now` (timer resumes), status → `revealed`, attempt `declined` with reason. The team can resubmit.
   - Dance **declined**: +penalty, stage completed (outcome `declined`), team `finished`.
   - The attempt leaves the pending queue (GSI attribute removed) in the same write.
6. **Team sees result** on its next poll: next clue / finished screen, or the decline reason with the question shown again.

A repeated decision (double tap) fails the condition and returns the current state; the GM can't decide on the same attempt twice.


No WebSockets. Clients poll only when something can change without them acting:
- Team waiting for the game to start: `GET /teams/me/state` every 5 s.
- Team in `awaiting_review` (photo/dance): `GET /teams/me/state` every 3 s.
- GM on `/admin`: `GET /admin/reviews` and `GET /admin/teams` every 5 s.

Polling pauses when the page is hidden and re-fetches immediately on screen wake and when the network returns. It lives in one client module, so WebSockets could be added later without touching screens.

## Map (agreed, ADR-008)
Leaflet + OpenStreetMap. `state.completedLocations` only includes completed stages, so upcoming destinations are never sent to the client.

## Admin console (agreed)
Same SPA at `/admin`, visible to `gamemaster` group users. Mobile-friendly. Protected server-side by the group check on every `/admin/*` route. Features: start game, leaderboard, review queue (photo + dance), accept text answers, route override, tie-break, publish results.
