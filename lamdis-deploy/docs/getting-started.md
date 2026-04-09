# Getting Started

This guide walks you through deploying Lamdis self-hosted using Docker Compose or Kubernetes (Helm).

## Prerequisites

- A Lamdis license file (`license.jwt`) — get one at [lamdis.ai/self-hosted](https://lamdis.ai/self-hosted)
- An OIDC-compatible identity provider (Okta, Azure AD, Keycloak, Google Workspace, etc.)
- AWS credentials with Bedrock access (for AI-powered test runs)

### Docker Compose

- Docker Engine 24+ with Compose V2

### Kubernetes

- Kubernetes 1.27+
- Helm 3.12+
- `kubectl` configured for your cluster

---

## Option A: Docker Compose

### 1. Clone the repository

```bash
git clone https://github.com/lamdis-ai/lamdis-deploy.git
cd lamdis-deploy/docker-compose
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Description |
|----------|-------------|
| `OIDC_ISSUER` | Your IdP's issuer URL (e.g., `https://your-org.okta.com`) |
| `OIDC_CLIENT_ID` | OAuth client ID |
| `OIDC_CLIENT_SECRET` | OAuth client secret |
| `LAMDIS_ADMIN_TOKEN` | Random string for bootstrap (`openssl rand -hex 32`) |
| `LAMDIS_API_TOKEN` | Random string for service auth (`openssl rand -hex 32`) |
| `AWS_ACCESS_KEY_ID` | AWS credentials for Bedrock |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials for Bedrock |

See [Configuration Reference](configuration.md) for all variables.

### 3. Place your license file

```bash
cp /path/to/your/license.jwt ./license.jwt
```

### 4. Start the stack

```bash
docker compose up -d
```

### 5. Bootstrap

Create the first organization and admin user:

```bash
curl -X POST http://localhost:3001/setup/bootstrap \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_ADMIN_TOKEN" \
  -d '{
    "orgName": "My Organization",
    "adminEmail": "admin@example.com"
  }'
```

### 6. Access the dashboard

Open [http://localhost:3000](http://localhost:3000) and log in via your OIDC provider.

---

## Option B: Kubernetes (Helm)

### 1. Create the license secret

```bash
kubectl create secret generic lamdis-license \
  --from-file=license.jwt=./license.jwt
```

### 2. Install with Helm

```bash
helm install lamdis ./helm/lamdis \
  --set oidc.issuer=https://your-idp.example.com \
  --set oidc.clientId=your-client-id \
  --set oidc.clientSecret=your-secret \
  --set bootstrap.adminToken=$(openssl rand -hex 32) \
  --set apiToken=$(openssl rand -hex 32) \
  --set aws.accessKeyId=AKIA... \
  --set aws.secretAccessKey=...
```

### 3. Bootstrap

```bash
# Get the API pod
API_POD=$(kubectl get pods -l app.kubernetes.io/component=api -o jsonpath='{.items[0].metadata.name}')

# Port-forward
kubectl port-forward $API_POD 3001:3001 &

# Bootstrap
curl -X POST http://localhost:3001/setup/bootstrap \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_ADMIN_TOKEN" \
  -d '{
    "orgName": "My Organization",
    "adminEmail": "admin@example.com"
  }'
```

### 4. Enable Ingress (optional)

```bash
helm upgrade lamdis ./helm/lamdis \
  --set ingress.enabled=true \
  --set ingress.host=lamdis.yourcompany.com \
  --set ingress.tls.enabled=true \
  --set ingress.tls.secretName=lamdis-tls
```

---

## Verify the deployment

```bash
# Docker Compose
./scripts/health-check.sh

# Kubernetes
kubectl get pods -l app.kubernetes.io/part-of=lamdis
```

## Next steps

- [Auth Setup](auth-setup.md) — detailed OIDC configuration for Okta, Azure AD, Keycloak
- [Configuration Reference](configuration.md) — all environment variables
- [License Management](license-management.md) — renewing and upgrading licenses
- [Upgrading](upgrading.md) — updating to new versions
