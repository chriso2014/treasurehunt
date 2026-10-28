# ADR-001: Single repo, separately deployable frontend and backend, AWS SAM

**Status:** Accepted

## Context
One developer, one event. Frontend (Node.js) and backend (AWS serverless) should evolve together but be deployable independently.

## Decision
- One GitHub repository containing both `frontend/` and `backend/`.
- Each area is built and deployed separately, each with its own AWS SAM template (`template.yaml`) and `samconfig.toml`.
- AWS SAM is the infrastructure-as-code tool.

## Consequences
- Changes to one side don't force a redeploy of the other.
- Shared values the frontend needs from the backend (API URL, bucket names, etc.) must be passed explicitly, resolved: a script reads backend stack outputs into `frontend/.env.<env>` (see `docs/08-infra-and-deployment.md`).
- Shared code (types, validation) lives in the `shared/` npm workspace.
