# Infrastructure & Deployment

## Stacks (AWS SAM, eu-west-2)
| Stack | Template | Contains |
|-------|----------|----------|
| `treasurehunt-backend-<env>` | `backend/template.yaml` | HTTP API + JWT authorizer, Lambdas, Cognito User Pool + client + `gamemaster` group, DynamoDB `Content` + `Game` tables, private assets bucket, SSM parameters |
| `treasurehunt-frontend-<env>` | `frontend/template.yaml` | Private S3 site bucket, CloudFront distribution (OAC, SPA fallback to `index.html`) |

Environments: **`dev`** (build and test) and **`prod`** (the event), in the same AWS account, selected with `samconfig.toml` config envs. Resource names include the env.

Domain: default `*.cloudfront.net` address (no custom domain for now).

## Cross-stack config
- Backend stack outputs: `ApiUrl`, `UserPoolId`, `UserPoolClientId`, `Region`, `ContentTable`, `GameTable`, `AssetsBucket`.
- `npm run frontend:env -- <env>` reads these outputs and writes `frontend/.env.<env>` (gitignored): `VITE_ENV`, `VITE_API_URL`, `VITE_REGION`, `VITE_USER_POOL_ID`, `VITE_USER_POOL_CLIENT_ID`.
- Backend needs the frontend's CloudFront URL for CORS: passed as a SAM parameter `AllowedOrigin` (set after the first frontend deploy).
- SSM parameter `/treasurehunt/<env>/gm-whatsapp-number` (String, international format). Created by hand so the number never reaches the repo; Lambdas read it (cached 5 min) to build the `wa.me` link on the dance stage. Without it the dance still works, but there's no button to open WhatsApp:
  ```bash
  aws ssm put-parameter --name /treasurehunt/dev/gm-whatsapp-number --type String --value '+44…' --overwrite --profile ChrisOrmerod
  ```
- Penalty defaults live in the content file (`config.defaultPenaltyMs`), not SSM.

## Developer access & prerequisites
- AWS CLI profile **`ChrisOrmerod`** (IAM Identity Center via `aws configure sso`; refresh with `aws sso login --profile ChrisOrmerod`). All CLI/SAM commands use `--profile ChrisOrmerod` (or `AWS_PROFILE=ChrisOrmerod`); `samconfig.toml` sets `profile = "ChrisOrmerod"` and `region = "eu-west-2"`.
- No manual IAM for the app: SAM creates all Lambda roles from `template.yaml`.
- Account safety: root MFA on; AWS Budget email alert.
- Local tools: Node 24 via nvm (`nvm use` reads `.nvmrc`; Lambda and CI stay on Node 22), AWS CLI v2, AWS SAM CLI, git (Docker only for `sam local`).
- Check access: `aws sts get-caller-identity --profile ChrisOrmerod`.

## Deploy (from your machine)
```bash
# backend
npm run deploy -w backend -- dev          # esbuild bundle (scripts/build.ts) + sam deploy
# frontend stack (S3 + CloudFront), only when frontend/template.yaml changes
npm run deploy:stack -w frontend -- dev
# frontend app
npm run frontend:env -- dev && npm run deploy -w frontend -- dev   # vite build, s3 sync, CloudFront invalidation
# content and GM user
npm run seed -- dev            # loads content/game.private.json (or pass a file: npm run seed -- dev content/game.example.json --allow-missing-images)
npm run seed -- --check        # validate the content file only, no AWS
npm run start-game -- dev      # registration → live (same as the admin start endpoint)
npm run review -- dev          # list photo/dance submissions; `approve <n>` or `decline <n> "reason"` (until /admin, phase 7)
npm run create-gm -- dev       # creates (or resets) user `gamemaster` in the gamemaster group; prompts for the password. Optional 2nd arg: username
```
First deploy of an env: frontend stack (`deploy:stack`, gives the `SiteUrl`) → put `AllowedOrigin=<SiteUrl>` in that env's `parameter_overrides` in `backend/samconfig.toml` → backend → frontend app (`frontend:env` + `deploy`) → seed → create GM. Prod's CORS needs a real origin, so never deploy the prod backend before `AllowedOrigin` is set. A backend deploy without `AllowedOrigin` leaves CORS allowing localhost only (dev).

## CI (GitHub Actions)
- On every push/PR: install, lint, type-check, `npm test`. No AWS credentials in CI; deploys stay manual.

## Data lifecycle
- DynamoDB on-demand, PITR on `Game` table.
- Assets bucket: block public access, SSE-S3, CORS for pre-signed POST from the CloudFront origin, lifecycle expiry on `teams/` (e.g. 30 days) as a backstop.
- After the event: `npm run cleanup -- prod` deletes team photos, team items and Cognito team users; optionally `sam delete` the stacks.

## Rules for Claude
- May run `sam validate`, `npm run build -w backend` and deploy to **dev**.
- **Never deploy to prod, delete stacks or run cleanup without explicit confirmation.**
