# Lamdis Deploy

Deploy [Lamdis](https://lamdis.ai) in your own infrastructure. Run the full platform — API, dashboard, and test execution engine — on a single machine with Docker Compose or on Kubernetes with Helm.

## What You'll Need

| Requirement | Details |
|-------------|---------|
| **License file** | A `license.jwt` file. Get a free Community license at [lamdis.ai/self-hosted](https://lamdis.ai/self-hosted), or contact [sales@lamdis.ai](mailto:sales@lamdis.ai) for Team/Business/Enterprise. |
| **OIDC provider** | Any OpenID Connect provider — Okta, Azure AD, Keycloak, Google Workspace, etc. You need an issuer URL, client ID, and client secret. See [Auth Setup](docs/auth-setup.md) for provider-specific instructions. |
| **AWS credentials** | An AWS access key with [Bedrock](https://aws.amazon.com/bedrock/) access (us-east-1). Used by the test execution engine to invoke AI models. |
| **Docker or Kubernetes** | Docker Engine 24+ with Compose V2 **or** Kubernetes 1.27+ with Helm 3.12+. |

## Architecture

```
                  ┌─────────────────────────────────────┐
                  │          Your Infrastructure         │
                  │                                      │
  Users ────────▶ │  ┌──────────┐      ┌──────────────┐ │
                  │  │ lamdis-  │      │  lamdis-api  │ │
                  │  │ web      │─────▶│  :3001       │ │
                  │  │ :3000    │      └──────┬───────┘ │
                  │  └──────────┘             │         │
                  │                    ┌──────┴───────┐ │
                  │                    │  lamdis-runs │ │──▶ AWS Bedrock
                  │                    │  :3101       │ │
                  │                    └──────┬───────┘ │
                  │                           │         │
                  │                    ┌──────┴───────┐ │
                  │                    │   MongoDB    │ │
                  │                    └──────────────┘ │
                  └─────────────────────────────────────┘
```

- **lamdis-web** — Next.js dashboard (port 3000)
- **lamdis-api** — Backend API (port 3001)
- **lamdis-runs** — Test execution engine (port 3101)
- **MongoDB** — Bundled by default, or bring your own (Atlas, DocumentDB, etc.)

## Quick Start — Docker Compose

### 1. Clone this repo

```bash
git clone https://github.com/lamdis-ai/lamdis-deploy.git
cd lamdis-deploy/docker-compose
```

### 2. Configure your environment

```bash
cp .env.example .env
```

Open `.env` and fill in these values:

```env
# ── OIDC (your identity provider) ──────────────────────
OIDC_ISSUER=https://your-org.okta.com/oauth2/default
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret

# ── Secrets (generate with: openssl rand -hex 32) ──────
LAMDIS_ADMIN_TOKEN=<random-string>
LAMDIS_API_TOKEN=<random-string>

# ── AWS Bedrock (for AI-powered test runs) ─────────────
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
```

See [Configuration Reference](docs/configuration.md) for all available variables including OIDC role mapping, custom ports, external MongoDB, and version pinning.

### 3. Add your license

```bash
cp /path/to/license.jwt ./license.jwt
```

### 4. Start everything

```bash
docker compose up -d
```

### 5. Bootstrap your first organization

```bash
curl -X POST http://localhost:3001/setup/bootstrap \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_ADMIN_TOKEN" \
  -d '{
    "orgName": "My Organization",
    "adminEmail": "admin@example.com"
  }'
```

### 6. Open the dashboard

Go to [http://localhost:3000](http://localhost:3000) and log in with your OIDC provider.

### Verify health

```bash
./scripts/health-check.sh
```

## Quick Start — Kubernetes (Helm)

### 1. Create secrets

```bash
# License
kubectl create secret generic lamdis-license \
  --from-file=license.jwt=./license.jwt
```

### 2. Install with Helm

```bash
helm install lamdis ./helm/lamdis \
  --set oidc.issuer=https://your-org.okta.com/oauth2/default \
  --set oidc.clientId=your-client-id \
  --set oidc.clientSecret=your-secret \
  --set bootstrap.adminToken=$(openssl rand -hex 32) \
  --set apiToken=$(openssl rand -hex 32) \
  --set aws.accessKeyId=AKIA... \
  --set aws.secretAccessKey=...
```

### 3. Bootstrap and access

```bash
# Port-forward to the API
kubectl port-forward svc/lamdis-api 3001:3001 &

# Bootstrap
curl -X POST http://localhost:3001/setup/bootstrap \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_ADMIN_TOKEN" \
  -d '{"orgName": "My Organization", "adminEmail": "admin@example.com"}'

# Port-forward to the web dashboard
kubectl port-forward svc/lamdis-web 3000:3000 &
```

Open [http://localhost:3000](http://localhost:3000).

### Optional: enable Ingress

```bash
helm upgrade lamdis ./helm/lamdis \
  --set ingress.enabled=true \
  --set ingress.host=lamdis.yourcompany.com \
  --set ingress.tls.enabled=true \
  --set ingress.tls.secretName=lamdis-tls
```

## Secrets Reference

| Secret | Where to set | How to generate | Used by |
|--------|-------------|-----------------|---------|
| `OIDC_CLIENT_SECRET` | `.env` or Helm values | From your OIDC provider | API, Web |
| `LAMDIS_ADMIN_TOKEN` | `.env` or Helm values | `openssl rand -hex 32` | API (bootstrap & admin endpoints) |
| `LAMDIS_API_TOKEN` | `.env` or Helm values | `openssl rand -hex 32` | API, Runs (service-to-service auth) |
| `AWS_ACCESS_KEY_ID` | `.env` or Helm values | From AWS IAM | Runs (Bedrock access) |
| `AWS_SECRET_ACCESS_KEY` | `.env` or Helm values | From AWS IAM | Runs (Bedrock access) |
| `license.jwt` | File mount | From [lamdis.ai/self-hosted](https://lamdis.ai/self-hosted) | API, Runs |

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/getting-started.md) | Full walkthrough for Docker Compose and Kubernetes |
| [Configuration Reference](docs/configuration.md) | All environment variables, ports, database, and Helm values |
| [Auth Setup (OIDC)](docs/auth-setup.md) | Step-by-step for Okta, Azure AD, Keycloak, and Google Workspace |
| [License Management](docs/license-management.md) | Tiers, installation, renewal, and usage monitoring |
| [Upgrading](docs/upgrading.md) | Version updates, rollbacks, and migration notes |

## Upgrading

```bash
# Docker Compose — update LAMDIS_VERSION in .env, then:
docker compose pull && docker compose up -d

# Helm:
helm upgrade lamdis ./helm/lamdis --set global.imageTag=1.1.0
```

See [Upgrading](docs/upgrading.md) for the full guide.

## License

The source code in this repository is licensed under the [Elastic License 2.0](LICENSE). You may **not** offer Lamdis as a hosted/managed service to third parties.

Lamdis self-hosted requires a **license file** (`license.jwt`) to operate. A free Community license is available for small teams:

| Tier | Users | Runs/Month | Price |
|------|-------|-----------|-------|
| Community | 5 | 200 | Free |
| Team | 20 | 5,000 | [Contact sales](mailto:sales@lamdis.ai) |
| Business | 100 | 25,000 | [Contact sales](mailto:sales@lamdis.ai) |
| Enterprise | Unlimited | Unlimited | [Contact sales](mailto:sales@lamdis.ai) |

Get a free Community license at [lamdis.ai/self-hosted](https://lamdis.ai/self-hosted). For Team, Business, or Enterprise licenses, contact [sales@lamdis.ai](mailto:sales@lamdis.ai).

See [License Management](docs/license-management.md) for details on tiers, limits, and renewal.
