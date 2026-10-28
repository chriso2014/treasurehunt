# Infrastructure & Deployment

## Stacks (AWS SAM, eu-west-2)
| Stack | Template | Contains |
|-------|----------|----------|
| `treasurehunt-backend-<env>` | `backend/template.yaml` | HTTP API + JWT authorizer, Lambdas, Cognito User Pool + client + `gamemaster` group, DynamoDB `Content` + `Game` tables, private assets bucket, SSM parameters |
| `treasurehunt-frontend-<env>` | `frontend/template.yaml` | Private S3 site bucket, CloudFront distribution (OAC, SPA fallback to `index.html`) |

Environments: **`dev`** (build and test) and **`prod`** (the event), in the same AWS account, selected with `samconfig.toml` config envs. Resource names include the env.

Domain: default `*.cloudfront.net` address (no custom domain for now).

## Cross-stack config
- Backend stack outputs: `ApiUrl`, `UserPoolId`, `UserPoolClientId`, `Region`, `AssetsBucket`.
- `npm run frontend:env -- <env>` reads these outputs and writes `frontend/.env.<env>` (gitignored).
- Backend needs the frontend's CloudFront URL for CORS: passed as a SAM parameter `AllowedOrigin` (set after the first frontend deploy).
- SSM parameters under `/treasurehunt/<env>/`: `gm-whatsapp-number`, `default-penalty-ms`.

## Developer access & prerequisites
- AWS CLI profile **`ChrisOrmerod`** (IAM Identity Center via `aws configure sso`; refresh with `aws sso login --profile ChrisOrmerod`). All CLI/SAM commands use `--profile ChrisOrmerod` (or `AWS_PROFILE=ChrisOrmerod`); `samconfig.toml` sets `profile = "ChrisOrmerod"` and `region = "eu-west-2"`.
- No manual IAM for the app: SAM creates all Lambda roles from `template.yaml`.
- Account safety: root MFA on; AWS Budget email alert.
- Local tools: Node 22, AWS CLI v2, AWS SAM CLI, git (Docker only for `sam local`).
- Check access: `aws sts get-caller-identity --profile ChrisOrmerod`.

## Deploy (from your machine)
```bash
# backend
npm run build -w backend && cd backend && sam build && sam deploy --config-env dev
# frontend
npm run frontend:env -- dev && npm run deploy -w frontend -- dev   # vite build, s3 sync, CloudFront invalidation
# content and GM user
npm run seed -- dev            # loads content/game.private.json
npm run create-gm -- dev       # creates the GM user in the gamemaster group (prompts for password)
```
First deploy order: backend → frontend → re-deploy backend with `AllowedOrigin` → seed → create GM.

## CI (GitHub Actions)
- On every push/PR: install, lint, type-check, `npm test`. No AWS credentials in CI; deploys stay manual.

## Data lifecycle
- DynamoDB on-demand, PITR on `Game` table.
- Assets bucket: block public access, SSE-S3, CORS for pre-signed POST from the CloudFront origin, lifecycle expiry on `teams/` (e.g. 30 days) as a backstop.
- After the event: `npm run cleanup -- prod` deletes team photos, team items and Cognito team users; optionally `sam delete` the stacks.

## Rules for Claude
- May run `sam build`, `sam validate`, and deploy to **dev**.
- **Never deploy to prod, delete stacks or run cleanup without explicit confirmation.**
