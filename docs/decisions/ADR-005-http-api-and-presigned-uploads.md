# ADR-005: API Gateway HTTP API + direct-to-S3 uploads via pre-signed POST

**Status:** Accepted

## Context
API Gateway has a 10 MB payload limit and Lambda a 6 MB sync payload limit. Phone photos can be several MB, and outdoor signal is unreliable.

## Decision
- Use an API Gateway **HTTP API** (native JWT authorizer, simpler and cheaper than REST API).
- Photos are uploaded **directly to S3** using a Lambda-issued **pre-signed POST** (key, content type and size restricted), after **client-side resizing**. Then a confirm call stores the key.
- S3 keys: `teams/{teamId}/team-photo.jpg`; photo-question submissions: `teams/{teamId}/submissions/{stage}-{timestamp}.jpg`.

## Consequences
- Fast, robust uploads; Lambda never handles image bytes.
- Two calls per upload (get URL, confirm).
