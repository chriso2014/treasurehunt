# ADR-012: Random question pictures picked from the team id

**Status:** Accepted

## Context
Some photo tasks ("recreate this meme") should show each team a different picture from a pool, and a team that has two such tasks in a row should get two different pictures. The picture must stay the same when the phone refreshes or polls, and the GM needs to see which picture a team was given when reviewing its photo.

## Decision
A question's `question` block may give `randomImageKeys` (a pool) instead of `imageKey`, plus an optional `randomImageSlot`. The picture shown is `pool[(hash(teamId) + slot) % pool.length]` (FNV-1a), computed by `questionImageKey` in `shared/` wherever it is needed: the team state and the GM review queue. Questions that share a pool use slots 0, 1, … so one team never sees the same picture twice, while different teams start at different places in the pool.

## Consequences
- Nothing is stored and no write is added: the pick is a pure function of the team id, so it is refresh-safe and the same on every Lambda.
- The pick isn't truly random and two teams can get the same picture; with ~5 teams and 12+ pictures that is fine.
- Changing the pool (adding or removing pictures) mid-game would change what teams see, so don't reseed during the game.
- The pool is never sent to the client; only the chosen picture's pre-signed URL is.
