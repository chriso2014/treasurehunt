# Frontend

> Status: agreed. Look & feel (colours, theme, on-screen name) TBD.

## Hosting
Static SPA built with Node.js tooling, deployed to S3 + CloudFront (ADR-002). One app serves both team and GM.

## Areas
| Path | Who | Notes |
|------|-----|-------|
| `/` | Teams | Register / sign in → waiting → clue → question → finished |
| `/map` | Teams | Completed locations only (Leaflet + OSM, ADR-008) |
| `/admin` | GM only | Shown only when signed in as a `gamemaster` group member; otherwise redirect to `/`. Real protection is on the API (admin routes require the group) |
| `/results` | Public, after publish | Final ranking |

Admin console is in the same app at `/admin`, designed to work on a phone (the GM will be out in Hitchin) and fine on a laptop.

## Team screens (driven by `state.current.status`)
| Status | Screen |
|--------|--------|
| game `registration` | Waiting for the game to start (team photo shown) |
| `clue` | Clue text/image + **Reveal question** button (+ warning that the timer starts) |
| `revealed` | Question + answer input for its type + live timer + Hint / Skip buttons |
| `awaiting_review` | "Waiting for game master…" with paused timer |
| team `finished` | Finished screen with total time; "See more about your time" opens each question's time and penalties (`state.results`) |

## Live updates (polling, ADR-007)
- Team: poll `GET /teams/me/state` every 5 s while waiting for the game to start, and every 3 s while `awaiting_review`. Otherwise use the `state` returned by each action.
- GM `/admin`: poll the review queue and leaderboard every 5 s.
- Pause polling when the page is hidden; re-fetch on `visibilitychange` and `online`.
- All polling in one module (`usePolling`/`poller`) so it can be replaced later.
- The live timer ticks locally from `state.current.timer`, re-synced on every response.

## Mobile considerations
- Large touch targets, readable in sunlight, works one-handed.
- Camera via `<input type="file" accept="image/*" capture>`, resized in the browser before upload.
- Every action button is disabled while its request is in flight; failed requests retry and then show a clear message.

## Stack
React + Vite + TypeScript, Tailwind CSS, React Router, `aws-amplify/auth` (v6), Leaflet. See `docs/09-coding-standards.md`.

## TBD
Look & feel: colours, theme, name shown on screen.
