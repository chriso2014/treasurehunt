# ADR-004: Cognito User Pool for team and GM auth, created via Lambda

**Status:** Accepted

## Context
Teams log in with team name + password. Identity pools issue AWS credentials and are not needed. Teams must not face email/SMS verification on the day.

## Decision
- Cognito User Pool. Teams are created by a `registerTeam` Lambda using `AdminCreateUser` + `AdminSetUserPassword`; self sign-up is disabled.
- Username = slug of the team name (Cognito usernames cannot contain spaces).
- GM is a manually created user in the `gamemaster` group.
- Tokens are sent in the `Authorization` header (not cookies), validated by an API Gateway JWT authorizer.

## Consequences
- No verification friction; team-name uniqueness is enforced by Cognito.
- The login form must apply the same slug rule to the typed team name.
