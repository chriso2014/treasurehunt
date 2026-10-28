# Testing

## Layers
| Layer | Tool | What |
|-------|------|------|
| Unit | **Vitest** | Pure logic in `backend/src/lib`: timer maths, answer matching (normalisation, typos, numeric, contains), transition rules (allowed actions per status), scoring and ranking |
| Handler | Vitest + `aws-sdk-client-mock` | Each handler: validation, auth (team vs GM), happy path, invalid state (409), conditional-write failure (retry returns current state) |
| Frontend | Vitest + React Testing Library | Screen chosen per `state.current.status`; buttons disabled while requests are in flight |
| End-to-end (dev stack) | `npm run e2e:dev` (`backend/scripts/e2e.ts`, calls the real API) | Registers 2 test teams and a temporary GM, starts the game, plays every question on both routes from the seeded content: wrong answers, hint, skip, photo decline + approve, dance approve + decline, with double taps and retried submissions. Checks penalties per stage, paused timer during review, no leaks in `state`, 401/403/409 cases, totals, ranking and public results; then resets dev |
| Rehearsal | People + phones in Hitchin | Full run on real phones (iOS + Android) on the prod stack with test content before the event |

## Must-have test cases
- Timer: pause/resume around photo review; declined photo resumes; dance decline adds a penalty and finishes; no time accrues while `awaiting_review`.
- Penalties: wrong answer, hint, skip (only after hint, not on dance), declines; per-question overrides.
- Double submit / retry: the second identical request doesn't double-penalise.
- Security: team A cannot read or act on team B; non-GM gets 403 on `/admin/*`; answers and hints never appear in `state` before they're earned; upcoming locations never appear in `completedLocations`.
- Text matching table tests built from the real `acceptedAnswers` (run locally against the private content file; not committed).

## Running
- `npm test`: all unit + handler + frontend tests (no AWS needed).
- `npm run e2e:dev`: against the deployed dev stack. Needs dev in registration with no teams (`npm run reset -- dev`), and resets dev when done (`-- --keep` leaves the teams to inspect). Signs in test users with Cognito's admin password flow, which only the dev app client allows.
- `sam local start-api` for manual local API testing against dev resources where useful.
