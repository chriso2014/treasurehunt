# Observability & Game-Day Operations

## Logging & monitoring
- Structured JSON logs (Powertools Logger) with `teamId`, `stage`, `action`, `result`. Log retention: 14 days.
- API Gateway access logs: `/aws/apigateway/treasurehunt-<env>` (route, status, latency, errors).
- CloudWatch alarms (prod, via SNS email to the address in SSM `/treasurehunt/prod/alarm-email`):
  - `treasurehunt-prod-api-5xx`: any API 5xx in 5 min (also emails when it clears). Every Lambda is behind the API and the handler wrapper turns unexpected errors into 500s, so this covers Lambda errors and timeouts; a separate Lambda `Errors` alarm would never fire.
  - `treasurehunt-prod-api-slow`: p90 latency over 3 s for 10 min.
- Admin leaderboard is the main live view of game health.

## Before the event
- [ ] Prod stacks deployed from a tagged commit; `npm test` and `npm run e2e:dev` pass
- [ ] Alarm email confirmed (click the link from AWS Notifications)
- [ ] Real content seeded to prod; text-matching tests pass against the private content
- [ ] GM user created; GM can sign in on their phone
- [ ] `gm-whatsapp-number` SSM parameter set; WhatsApp link opens a chat with the GM
- [ ] Rehearsal done in Hitchin with test teams on iOS and Android
- [ ] Test teams and their data removed from prod: `npm run reset -- prod` (game back to `registration`)
- [ ] GM phone charged + power bank; the app URL shared with teams (QR code)

## During the event
- Keep `/admin` open for the review queue (photos and dance calls).
- If a team has a problem: they can sign in on another phone with team name + password and continue.
- Mistakes: use "accept text answer" or time adjustment in admin; never edit DynamoDB by hand unless unavoidable (and note it).
- If something breaks: check alarms/logs in CloudWatch for the failing Lambda (log group per function).

## After the event
- Publish results and share the `/results` link.
- Export results (optional), then run `npm run reset -- prod` (photos, team items, Cognito team users).
- Optionally `sam delete` the stacks.
