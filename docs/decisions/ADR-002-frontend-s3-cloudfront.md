# ADR-002: Frontend as static SPA on S3 + CloudFront

**Status:** Accepted (replaces the original plan of a containerised SPA on EC2)

## Context
The project is meant to be exclusively serverless. The camera API (used for team photos and photo questions) only works on HTTPS pages. A single-page app needs no runtime server.

## Decision
Build the SPA with Node.js tooling and deploy the static output to a private S3 bucket served through CloudFront (Origin Access Control), deployed via its own SAM template.

## Consequences
- HTTPS by default, no server to patch, near-zero cost.
- Client-side routing needs CloudFront to return `index.html` for unknown paths (custom error response 403/404 → `/index.html`, 200).
- Runtime config (API URL, Cognito IDs) is injected at build/deploy time from backend stack outputs / SSM.
