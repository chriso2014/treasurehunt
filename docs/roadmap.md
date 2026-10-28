# Roadmap

Event date: **TBD**. Aim to finish phase 9 at least a week before for the rehearsal.

Each phase should fit in one or two Claude sessions and ends with something testable. Start a session with `/next-phase`.

| # | Phase | Done when | Status |
|---|-------|-----------|--------|
| 0 | Context files | All docs filled, decisions recorded | Done (look & feel and event date still TBD) |
| 1 | Scaffold | npm workspaces, TS configs, ESLint/Prettier, Vitest, GitHub Actions CI (lint + test); `backend/template.yaml` and `frontend/template.yaml` skeletons deploy to dev; frontend "hello" page served via CloudFront | Done (dev: https://d13nqxaptk59d6.cloudfront.net) |
| 2 | Data + content | `Content` + `Game` tables, assets bucket; `shared/` content schema (zod); `npm run seed -- dev` validates and loads `content/game.example.json`/private file | Done (dev deployed, example content seeded) |
| 3 | Auth + registration | Cognito pool, `gamemaster` group, `create-gm` script; `POST /teams` (slug, route alternation, rollback); photo upload + confirm; register/sign-in/waiting screens on a phone | Done (tested on a phone on dev) |
| 4 | Core game loop | `lib/` timer, transitions, answer matching (fully unit-tested); `GET state`, `reveal`, `answer` for dropdown + free text; GM `start` endpoint; clue → question → next clue screens with live timer | Done (played through on a phone on dev) |
| 5 | Hints + skip | `hint`, `skip` endpoints with rules and penalties; confirm dialogs in the UI | Done |
| 6 | Photo + dance questions | Submission photo upload, `awaiting_review` pause, WhatsApp link from SSM; team polling while waiting | Done |
| 7 | Admin console | `/admin`: leaderboard, review queue with approve/decline + reason, accept text answer, route override, tie-break, publish results; GM polling; public `/results` | Done (A9 time adjustment left out until needed) |
| 8 | Map + finished screen | Leaflet map of completed locations; finished screen with total | Done |
| 9 | Hardening + rehearsal | Retry/double-tap safety verified; `e2e:dev` passes; alarms; prod deploy; real content seeded; rehearsal in Hitchin on iOS + Android | In progress: `reset` + `e2e:dev` scripts, API 5xx/latency alarms, access logs built; `e2e:dev` passes (165 checks; first run found a double-tap answer bug, fixed). Still to do: prod deploy, real content, rehearsal |
| 9b | Optional: cartoon team photo | Provider tested and chosen (ADR-010); async `stylisePhoto` Lambda; fallback to original | Not started (decide provider first) |
| 10 | Post-event cleanup | Results shared; `cleanup` script run on prod; stacks deleted or kept | Not started |
