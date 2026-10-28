# Backend: Claude context

SAM app: HTTP API (Cognito JWT authorizer) → one Lambda per route (TypeScript, Node 22, arm64, esbuild) → DynamoDB `Content` + `Game` tables, private S3 assets bucket.

Read before changing behaviour: `docs/02-domain-and-glossary.md` (rules), `docs/04-data-model.md` (items, timer, transitions), `docs/05-api-contract.md` (endpoints, `state` shape), `docs/06-auth-and-security.md`.

## Rules
- `teamId` comes from `event.requestContext.authorizer.jwt.claims.sub`. Never from the body or path.
- Admin handlers must check `cognito:groups` contains `gamemaster` (helper in `lib/auth.ts`).
- Handlers stay thin; rules go in `lib/` as pure functions with unit tests.
- Every state change is a conditional write on the current `status`, or a `TransactWriteItems` for stage completion. On `ConditionalCheckFailed`, reload and return the current `state` (makes retries safe).
- All timestamps from `lib/clock.ts`; durations in ms.
- Never put correct answers, accepted answers, hints (before use) or upcoming locations in a response.
- Images: issue pre-signed POST (key, type and size restricted) / pre-signed GET (≤15 min). Lambdas never handle image bytes.
- New route = handler + zod schema in `shared/` + entry in `template.yaml` with least-privilege policy + test + update `docs/05-api-contract.md`.

## Commands
```bash
npm test -w backend
npm run lint -w backend
sam validate --lint && sam build
sam deploy --config-env dev
npm run seed -- dev
```
