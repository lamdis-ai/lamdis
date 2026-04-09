Lamdis CI/CD Integration
========================

Overview
--------

This document describes the API surface for external CI/CD pipelines (GitHub Actions, GitLab CI, local scripts) to trigger Lamdis test suite runs against lower environments and retrieve results asynchronously.

OpenAPI
-------

See `openapi/ci-cd.yaml` for the formal specification of the following endpoints and request/response shapes.

Authentication
--------------

- Use an API key with scope `runs:*` or more granular (`runs:trigger`, `runs:read`).
- Provide it via `Authorization: Bearer <LAMDIS_API_KEY>`.

Endpoints
---------

- `POST /v1/integrations/ci/runs` — Trigger a run.
  - Body includes:
    - `suiteSelector` (e.g. `{ "slugs": ["default"] }`)
    - `target` (e.g. `{ "type": "http", "baseUrl": "http://localhost:3000" }`)
    - Optional `source` metadata (provider, repo, commit, PR number)
    - Optional `callback` with `url` (Lamdis will POST results when done)
    - Optional `labels` for traceability
  - Response includes `runId`, `status`, and `dashboardUrl`.

- `GET /v1/integrations/ci/runs/:runId` — Poll for status and a compact `summary`.

- `GET /v1/developer/api-keys` — List keys (JWT-protected dashboard context).

- `POST /v1/developer/api-keys` — Create an API key, returns metadata and one-time `secret`.

- `DELETE /v1/developer/api-keys/:id` — Revoke a key.

Notes for Implementation
------------------------

- Reuse the existing run orchestration that powers dashboard-triggered suite runs.
- The CI trigger should enqueue the same job type with target overrides from the payload.
- Webhook delivery: POST the full run payload or a minimal summary to `callback.url` with optional HMAC using `callback.secret`.
- Return `dashboardUrl` that links to the run details in Lamdis.

Example curl
------------

```
curl -s -X POST "$LAMDIS_API_URL/v1/integrations/ci/runs" \
  -H "Authorization: Bearer $LAMDIS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "suiteSelector": {"slugs": ["default"]},
    "target": {"type":"http","baseUrl":"http://localhost:3000"},
    "wait": false
  }'
```

