Lamdis CI/CD Wiring Guide
=========================

This guide shows how to register the CI/CD and Developer API Key routes in lamdis-api and connect them to lamdis-runs.

Environment variables
---------------------

- `LAMDIS_RUNS_URL` — Base URL for lamdis-runs service (e.g. `http://localhost:7071`).
- `LAMDIS_DASHBOARD_URL` — Public base URL for the Lamdis web dashboard (used to build `dashboardUrl` links).
- `LAMDIS_API_KEY` — Optional single fallback API key for quick testing of CI endpoints.

Register routes (Express)
-------------------------

```ts
// server.ts
import express from 'express';
import bodyParser from 'body-parser';
import { registerCiRoutesExpress } from './src/integrations/ci/routes.express';
import { registerDeveloperKeyRoutesExpress } from './src/integrations/developer/apiKeys/routes.express';

const app = express();
app.use(bodyParser.json());

// Protect developer routes with your existing auth middleware if available.
registerDeveloperKeyRoutesExpress(app);
registerCiRoutesExpress(app);

app.listen(process.env.PORT || 4000);
```

Register routes (Fastify)
-------------------------

```ts
// server.ts
import Fastify from 'fastify';
import { registerCiRoutesFastify } from './src/integrations/ci/routes.fastify';
import { registerDeveloperKeyRoutesFastify } from './src/integrations/developer/apiKeys/routes.fastify';

const fastify = Fastify();

// Protect developer routes with your existing auth hooks if available.
await registerDeveloperKeyRoutesFastify(fastify);
await registerCiRoutesFastify(fastify);

await fastify.listen({ port: Number(process.env.PORT) || 4000 });
```

Notes
-----

- The CI endpoints use Bearer token auth verified against the file-backed key store in `lamdis-api/.data/api-keys.json` or the fallback `LAMDIS_API_KEY` env.
- The Developer API keys routes are intentionally unopinionated about authentication; protect them with your existing auth in production.
- The CI service calls lamdis-runs via `POST /v1/runs` and `GET /v1/runs/:id` (configure `LAMDIS_RUNS_URL`). Adapt in `src/integrations/ci/service.ts` if your lamdis-runs API differs.

