# ADR-011: Pre-bundle Lambdas with esbuild instead of SAM's esbuild builder

**Status:** Accepted

## Context
SAM's built-in esbuild builder (`Metadata: BuildMethod: esbuild`) runs `npm install` in a copy of each function's `CodeUri`. In an npm workspaces repo that breaks on the local `@treasurehunt/shared` package, which isn't on the npm registry.

## Decision
`npm run build -w backend` (`backend/scripts/build.ts`) bundles every `src/handlers/<group>/<name>.ts` with esbuild into `dist/<group>-<name>/index.mjs` (ESM, Node 22, AWS SDK v3 left external). Each function's `CodeUri` in `template.yaml` points at its `dist` folder and `sam deploy` packages it as is; `sam build` is not needed.

## Consequences
- Workspace imports (`@treasurehunt/shared`) just work, and the bundle is the same locally and in deploys.
- Adding a handler file is picked up by the build automatically; it still needs its `template.yaml` entry.
- `npm run deploy -w backend -- <env>` always rebuilds first, so stale bundles aren't deployed.
