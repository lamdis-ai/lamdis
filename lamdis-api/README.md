## Overview

Lamdis API is the control plane and public API for organizations, manifests, billing, and analytics.

## Transport modes (canonical rule)

Default = Direct: Manifests export vendor endpoints. Agents call vendors directly using provider-native auth (OAuth, API keys) declared in the manifest.

Optional = Hosted/Proxy: Only when explicitly chosen (Hosted Actions or special needs like PII shielding). Then actions point to lamdis.ai and Lamdis calls the vendor.

IR encodes this via `transport.mode` in each action: `direct` (default), `hosted`, or `proxy`. Exporters honor this when generating OpenAPI, MCP, and JSON-LD.

## Analytics and ingestion

Lamdis tracks usage for:
- Manifest retrievals (public endpoints)
- Hosted action invocations (executed by lamdis-api)
- Gateway traffic from lamdis-agents-api (A2A and MCP) via a decoupled ingestion endpoint

### Ingestion endpoint (for producers)

- URL: `POST /analytics/ingest`
- Auth: shared secret header `x-lamdis-ingest-secret`
- Status: returns `202 Accepted` on success
- Env: set `INGEST_SECRET` in lamdis-api to enable the endpoint

Payload schema (JSON):

```
{
	orgId: string,
	orgSlug?: string,
	actionKey?: string,
	providerKey?: string,
	route?: string,
	source: 'gateway-a2a' | 'gateway-mcp' | 'hosted',
	requestId?: string,
	idempotencyKey?: string,
	status: 'success' | 'failure',
	statusCode?: number,
	durationMs?: number,
	createdAt?: string (ISO date)
}
```

Idempotency: if `idempotencyKey` is provided, writes are upserted by `(orgId, source, idempotencyKey)` to avoid duplicates.

Storage: events are persisted in `InvocationLog` (see `src/models/InvocationLog.ts`).

### Analytics API

- `GET /analytics/manifest?orgId=...&range=7d` – daily manifest access counts
- `GET /analytics/actions?orgId=...&range=7d` – daily invocation counts (hosted + gateway, merged)
	- Optional `includeSources=1` to receive per-source series: `{ sources: { hosted: [...], gateway: [...] } }`
- `GET /analytics/actions/summary?orgId=...&range=7d` – per-action totals and success rates (hosted + gateway)

Notes:
- All analytics endpoints require a valid user JWT and org membership.
- Range supports `Nd` (e.g., `7d`), capped at 30 days.

### Quick start: generate secret

On a machine with Node.js:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Set the output as `INGEST_SECRET` in lamdis-api and the same value in lamdis-agents-api.

# lamdis-api
\n+## Runner integration

To delegate test execution to lamdis-runs, configure:

- LAMDIS_RUNS_URL: base URL of the runner service (e.g., http://localhost:3101)
- LAMDIS_RUNS_TOKEN: shared secret used to authenticate calls to lamdis-runs

lamdis-api continues to expose read endpoints for runs and suites; only the execution moves out-of-process. Ensure lamdis-runs points at the same MongoDB.