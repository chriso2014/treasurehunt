# Observability & Game-Day Operations

## Logging & monitoring
- Structured JSON logs (Powertools Logger) with `teamId`, `stage`, `action`, `result`. Log retention: 14 days.
- API Gateway access logs enabled.
- CloudWatch alarms (prod): any Lambda `Errors` > 0 in 5 min, API 5xx > 0 → SNS email to the GM.
- Admin leaderboard is the main live view of game health.

## Before the event
- [ ] Prod stacks deployed from a tagged commit; `npm test` and `npm run e2e:dev` pass
- [ ] Real content seeded to prod; text-matching tests pass against the private content
- [ ] GM user created; GM can sign in on their phone
- [ ] `gm-whatsapp-number` SSM parameter set; WhatsApp link opens a chat with the GM
- [ ] Rehearsal done in Hitchin with test teams on iOS and Android
- [ ] Test teams and their data removed from prod; game state reset to `registration`
- [ ] GM phone charged + power bank; the app URL shared with teams (QR code)

## During the event
- Keep `/admin` open for the review queue (photos and dance calls).
- If a team has a problem: they can sign in on another phone with team name + password and continue.
- Mistakes: use "accept text answer" or time adjustment in admin; never edit DynamoDB by hand unless unavoidable (and note it).
- If something breaks: check alarms/logs in CloudWatch for the failing Lambda (log group per function).

## After the event
- Publish results and share the `/results` link.
- Export results (optional), then run `npm run cleanup -- prod` (photos, team items, Cognito team users).
- Optionally `sam delete` the stacks.
