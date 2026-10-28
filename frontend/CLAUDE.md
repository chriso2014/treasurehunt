# Frontend: Claude context

React + Vite + TypeScript + Tailwind SPA, deployed to S3 + CloudFront. Contains the team app (`/`, `/map`), admin console (`/admin`, `gamemaster` group only) and public results (`/results`).

Read: `docs/07-frontend.md` (screens, polling, mobile), `docs/05-api-contract.md` (endpoints and `state` shape).

## Rules
- Screens render from the server `state` object. Never implement game rules or timing logic client-side; the timer display just ticks from `state.current.timer` and re-syncs.
- All API calls go through `src/api/` (typed with `shared/` types); auth via `src/auth/` (Amplify Auth v6). Send the access token as `Authorization: Bearer`.
- All polling goes through `src/lib/poller.ts` (ADR-007): only while waiting for start (5 s), `awaiting_review` (3 s), or on `/admin` (5 s); pause when hidden; re-fetch on `visibilitychange`/`online`.
- Mobile-first: big buttons, high contrast for sunlight, one-handed use. Disable action buttons while a request is in flight.
- Photos: `<input type="file" accept="image/*" capture>`, resize to ≤1600px JPEG in the browser, upload via the pre-signed POST, then confirm.
- Confirm before actions that add a penalty (hint, skip) and before Reveal (timer starts).
- Map: Leaflet + OSM with attribution; only `state.completedLocations`.
- Config only from `VITE_` env vars (`frontend/.env.<env>`, generated, gitignored).

## Commands
```bash
npm run dev -w frontend
npm test -w frontend
npm run lint -w frontend
npm run deploy:stack -w frontend -- dev   # S3 + CloudFront stack
npm run deploy -w frontend -- dev         # build, s3 sync, invalidate
```
