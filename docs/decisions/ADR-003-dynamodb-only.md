# ADR-003: DynamoDB for all data

**Status:** Accepted (replaces the original plan of DynamoDB for questions + RDS for progress)

## Context
Lambda with RDS requires a VPC, connection management (RDS Proxy) and a non-serverless database. Data volume is tiny (~5 teams, ~10–20 stages).

## Decision
Use DynamoDB for both game content and game state. Table design to be defined in `docs/04-data-model.md`.

## Consequences
- Fully serverless, no VPC needed, one data technology to learn and test.
- Leaderboard/aggregations are computed in Lambda (trivial at this scale).
- Atomic counters and conditional writes are used for route assignment and to prevent double-submits.
