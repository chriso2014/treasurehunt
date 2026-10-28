# Coding Standards

## Language & runtime
- **TypeScript** everywhere, `strict: true`. No `any` without a comment explaining why.
- **Node.js 22** locally and on Lambda (`nodejs22.x`, `arm64`).
- ES modules. AWS SDK **v3** (modular clients) only.

## Repo layout (npm workspaces)
```
package.json              # workspaces: shared, backend, frontend; root scripts
tsconfig.base.json
shared/                   # types shared by both sides (API request/response, state object, enums)
  src/
backend/
  template.yaml           # SAM: HTTP API, Lambdas, Cognito, DynamoDB, S3, SSM
  samconfig.toml          # config envs: dev, prod
  src/
    handlers/team/        # one file per team route, e.g. reveal.ts, answer.ts
    handlers/admin/       # one file per admin route
    handlers/public/      # register.ts, results.ts
    lib/                  # db.ts, state.ts (load/compute), timer.ts, answers.ts (matching),
                          # transitions.ts, s3.ts, auth.ts (claims, group check), http.ts (responses/errors), config.ts
  scripts/                # seed.ts, create-gm.ts, cleanup.ts, write-frontend-env.ts
  tests/
frontend/
  template.yaml           # SAM: S3 bucket + CloudFront (OAC, SPA fallback)
  samconfig.toml
  src/
    pages/                # Register, SignIn, Play, Map, Finished, Admin/*, Results
    components/
    api/                  # typed client for every endpoint (uses shared types)
    auth/                 # Amplify Auth wrapper
    lib/poller.ts         # the only place polling happens (ADR-007)
  scripts/deploy.ts       # build, s3 sync, CloudFront invalidation
content/                  # game.example.json (committed), game.private.json (gitignored)
```

## Backend conventions
- **One Lambda per route**, bundled by SAM's esbuild builder (`Metadata: BuildMethod: esbuild`).
- Handlers are thin: parse + validate input (zod), get `teamId` from JWT claims, call `lib/` functions, return via `http.ts` helpers. Business rules live in `lib/` as **pure functions** where possible (timer maths, answer matching, transition rules), so they are unit-testable without AWS.
- Validate all input with **zod** schemas, shared with the frontend via `shared/`.
- Errors: throw typed `AppError(code, message, status)`; `http.ts` maps them to the error format in `docs/05-api-contract.md`. Unexpected errors → 500 with no internal details.
- Time: get "now" from one injectable `clock` so tests can control it. Always `new Date().toISOString()` (UTC) server-side.
- DynamoDB: Document client; every state change is a conditional write or transaction (ADR-006).
- Logging: Powertools for AWS Lambda (TypeScript) Logger, structured JSON, include `teamId`, `stage`, `action`. Never log passwords, tokens or answers.
- Config from environment variables set in `template.yaml` (table names, bucket, SSM parameter names). Nothing environment-specific hard-coded.

## Frontend conventions
- **React + Vite**, function components and hooks. **Tailwind CSS** for styling.
- Routing: React Router. Server state: plain fetch wrapper in `api/` (no heavy data library needed).
- Auth: `aws-amplify/auth` (v6) only for Cognito sign-in, tokens and refresh.
- The UI renders from the server `state` object; never compute game rules client-side.
- Build-time config via `VITE_` env vars in `frontend/.env.<env>` (generated from backend stack outputs, gitignored).

## Style & tooling
- ESLint (typescript-eslint) + Prettier, run in CI and before commits.
- Naming: `camelCase` variables/functions, `PascalCase` types/components, kebab-case file names for non-components.
- Small, focused commits with clear messages. Never commit secrets, `.env*` files or `content/game.private.json`.
