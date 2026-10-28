# Auth & Security

## Identities
| Who | How | Access |
|-----|-----|--------|
| Team | Cognito User Pool user. Username = slug of team name, password chosen at sign-up | Own team's data and game endpoints only |
| Game master | Cognito User Pool user in group **`gamemaster`**, created manually (not via sign-up) | Admin endpoints |
| Anonymous | none | `POST /teams` (sign-up) only, and the published results page once released |

## Cognito User Pool settings
- Username sign-in, **case-insensitive** usernames.
- Self sign-up via Cognito **disabled**. Teams are created by the `registerTeam` Lambda (`AdminCreateUser` + `AdminSetUserPassword`), so there are no verification emails or SMS.
- Password policy: kept light for a fun event (e.g. min 8 chars, no complexity requirements; Cognito minimum is 6).
- App client: public SPA client (no secret); `USER_SRP_AUTH` + refresh token flow.
- Token validity: access/ID token 1 hour; refresh token 7 days (covers the event).

## API authorisation
- API Gateway HTTP API **JWT authorizer** validates the Cognito access token on every route except sign-up and published results.
- Lambdas derive `teamId` from the token's `sub` claim. **Never trust a teamId sent in the request body or path.** `/teams/me/...` routes act on the caller's own team.
- Admin routes check `cognito:groups` includes `gamemaster` (authorizer scopes or in-Lambda check).
- Tokens are sent in the `Authorization: Bearer` header (no cookies). CORS allows only the CloudFront domain.

## Data protection
- S3 bucket: private, block all public access, SSE-S3 encryption, objects only accessed via short-lived pre-signed URLs (upload ≤5 min, view ≤15 min).
- Pre-signed uploads restricted by key, content type and size.
- Correct answers and hints are never sent to the client until earned.
- Personal data: team photos only (no phone numbers). Delete photos, team records and Cognito users after the event (roadmap phase 10). An S3 lifecycle rule can expire photos as a backstop.
- Public repo: no secrets, game content, phone numbers or account IDs in Git (see CLAUDE.md).

## IAM
- One least-privilege role per Lambda (SAM policy templates, e.g. `DynamoDBCrudPolicy` scoped to the table, `S3CrudPolicy` scoped to the bucket and prefix).
