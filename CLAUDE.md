# Hitchin Treasure Hunt

A mobile web game for a one-off team day in Hitchin town. Teams register (team name, password, team photo) on one phone per team and are assigned route A or B. Each route sends them through the same locations in a different order. At each location they tap **Reveal question** and answer it: a dropdown, free text, a photo reviewed live by the game master, or (finally) a WhatsApp video-call dance judged by the game master.

**Scoring: time from Reveal to correct answer, plus 5-minute penalties (wrong answer, declined submission, hint, skip). Travel time doesn't count. The lowest total wins.**

Scale: one event, ~5 teams of 4 + 1 game master (GM). Status: see `docs/roadmap.md`.

## Tech stack
- **Exclusively AWS serverless**, region **eu-west-2**, IaC **AWS SAM** with separate `backend/` and `frontend/` stacks, `dev` + `prod` envs
- **TypeScript**, **Node 22**, npm workspaces (`shared`, `backend`, `frontend`)
- Frontend: **React + Vite + Tailwind** SPA on **S3 + CloudFront**; team app, `/admin` (GM) and `/results` in one app
- API: **API Gateway HTTP API** + Cognito JWT authorizer → **one Lambda per route** (esbuild)
- Auth: **Cognito User Pool** (teams created by Lambda; GM in `gamemaster` group); `aws-amplify/auth` on the client; `Authorization: Bearer` header
- Data: **DynamoDB** `Content` + `Game` tables; private **S3** for photos via pre-signed URLs; config in **SSM**
- Live updates: **short polling** (ADR-007). Map: **Leaflet + OpenStreetMap**, completed locations only
- Tests: **Vitest**, `aws-sdk-client-mock`, e2e script against dev. Lint: ESLint + Prettier. CI: GitHub Actions (lint + test only)
- Repo: **public** https://github.com/chriso2014/treasurehunt

## Repository layout
```
shared/     Types + zod schemas used by both sides
backend/    SAM app: Lambdas, Cognito, DynamoDB, S3 (own CLAUDE.md)
frontend/   React SPA + S3/CloudFront SAM template (own CLAUDE.md)
content/    game.example.json (committed); game.private.json (gitignored, real content)
docs/       Project context; read the relevant file before working on an area
.claude/    Settings and commands: /next-phase, /add-endpoint, /pre-commit-check
```

## Commands
```bash
npm install                      # all workspaces
npm test                         # unit + handler + frontend tests
npm run lint && npm run typecheck
npm run dev -w frontend          # local frontend against the dev API
cd backend && sam build && sam deploy --config-env dev
npm run frontend:env -- dev && npm run deploy -w frontend -- dev
npm run seed -- dev              # load content/game.private.json
npm run e2e:dev                  # full scripted game against dev
```

## Core rules
- **Timing and answer checking are server-side only.** Timer = `activeMs` + `runningSince`, paused during GM review (ADR-006). Client clocks are display only.
- **Never send correct answers, hints (before use) or upcoming locations to the client.**
- Derive `teamId` from the token `sub`, never from request input. `/admin/*` requires the `gamemaster` group.
- State changes only via **action endpoints** (`reveal`, `answer`, `hint`, `skip`, `photo`, `video-call`, admin decisions). Every write is conditional on current status; retries and double taps must be harmless.
- Images go browser → S3 via pre-signed POST, never through Lambda.
- **Public repo:** never commit game content, `content/game.private.json`, `.env*` files, phone numbers, secrets, account IDs or personal data. Run `/pre-commit-check` before committing.
- Mobile-first and outdoor-proof: flaky signal, refresh-safe, big buttons.
- **Keep it simple.** One event, ~20 people. Prefer the simplest reliable option.
- AWS CLI/SAM always use profile **`ChrisOrmerod`**, region eu-west-2 (set in `samconfig.toml`).
- Deploy to **dev** freely; **never deploy to prod, delete stacks or run cleanup without my explicit OK.**
- Work one roadmap phase at a time; update `docs/roadmap.md` and affected docs when done; record significant decisions as ADRs in `docs/decisions/`.

## Context docs (read when relevant)
| File | Contents |
|------|----------|
| `docs/00-project-brief.md` | Purpose, scope, constraints |
| `docs/01-requirements.md` | Team + GM features, acceptance criteria |
| `docs/02-domain-and-glossary.md` | **Game rules**, question types, text matching, penalties, scoring, states |
| `docs/03-architecture.md` | Services, sign-up flow, gameplay, polling, map, admin |
| `docs/04-data-model.md` | DynamoDB items, timer model, transitions, access patterns |
| `docs/05-api-contract.md` | Endpoints, `state` object, errors |
| `docs/06-auth-and-security.md` | Cognito, authorisation, data protection |
| `docs/07-frontend.md` | Screens, polling, mobile UX |
| `docs/08-infra-and-deployment.md` | Stacks, env config, deploy steps, cleanup |
| `docs/09-coding-standards.md` | Layout and conventions |
| `docs/10-testing.md` | Test layers, must-have cases |
| `docs/11-observability-ops.md` | Logging, alarms, game-day runbook |
| `docs/roadmap.md` | Phases and status |
| `docs/decisions/` | ADRs 001–010 (010 = optional cartoon photo, proposed) |
