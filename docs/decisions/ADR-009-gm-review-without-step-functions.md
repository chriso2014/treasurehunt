# ADR-009: GM review of photo/dance submissions via direct API, not Step Functions

**Status:** Accepted

## Context
Photo and dance answers need a human approve/decline that then updates the game state. Step Functions' callback pattern (`waitForTaskToken` + `SendTaskSuccess`) was considered.

## Decision
Keep the direct approach: the submission writes a `pending` attempt and pauses the timer; the GM's decision calls an admin endpoint whose Lambda applies the outcome in a DynamoDB transaction. Flow in `docs/03-architecture.md`.

## Why not Step Functions
- The same admin UI and endpoint are needed either way; the workflow would only wrap one database write.
- It would add task-token storage, execution clean-up on resubmission, and split the rules between the state machine and Lambda.
- Its main extra (review timeouts/reminders) isn't needed: the timer is paused during review, so review speed never affects scores, and the admin queue is live.

## Revisit if
Reminders/escalation for slow reviews become wanted. A timeout-and-notify workflow could be added without changing the API.
