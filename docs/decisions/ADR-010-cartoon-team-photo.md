# ADR-010: AI cartoon version of the team photo (optional feature)

**Status:** Proposed. Provider to be decided after a test. Not part of the core build.

## Idea
After a team uploads its photo, generate a cartoon-style version and show it on the waiting screen, leaderboard and results.

## Design (provider-independent)
- Trigger: S3 `ObjectCreated` on `teams/{teamId}/team-photo.jpg` → `stylisePhoto` Lambda, **asynchronous** (HTTP API has a 30 s limit; generation takes several seconds). Timeout 60 s, built-in async retries, on-failure destination for errors.
- Team item gets `photoStyle: processing | ready | failed` and `cartoonPhotoKey` (`teams/{teamId}/team-photo-cartoon.png`).
- **Fallback:** on any failure or safety-filter rejection, keep the original photo. Never blocks the game.
- Waiting screen already polls every 5 s → shows "Cartoonising…" then the result.
- Model call behind a single `stylise(photo)` function so the provider is swappable.
- **No pre-warming / provisioned concurrency**: cold start (<1 s) is negligible next to generation time, the work is async, and there are ~5 calls in total.
- Proposed UX defaults: team chooses original or cartoon; up to 2 retries before the game starts.

## Provider options
| Option | Notes |
|--------|-------|
| **Amazon Bedrock, Stability AI** (Style Transfer with a reference image, or Control Structure with a prompt) | Preferred for simplicity: IAM only, no secret, all-AWS. US regions only (call `us-west-2` from the eu-west-2 Lambda). Needs model access / Marketplace subscription. Image-editing services may be API-only (not in the console playground). Quality on group photos to be tested |
| Google Gemini image / OpenAI GPT Image / FLUX Kontext | Likely better likeness from plain instructions. Needs an API key in Secrets Manager / SSM SecureString (public repo) |
| Claude on Bedrock | Not possible: text output only |

## Open
- Test 2–3 real group photos with the Bedrock Stability models (via a small script) and decide.
- Tell teams their photo will be processed by an AI service (outside the UK).
