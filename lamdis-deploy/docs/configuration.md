# Configuration Reference

All Lamdis services are configured via environment variables. In Docker Compose, set them in `.env`. In Kubernetes, they are managed via the Helm chart's `values.yaml`.

---

## Deployment Mode

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `LAMDIS_DEPLOYMENT_MODE` | `cloud`, `self_hosted` | `cloud` | Controls overall deployment behavior |
| `LAMDIS_AUTH_MODE` | `auth0`, `oidc`, `disabled` | `auth0` | Authentication strategy |
| `LAMDIS_ENTITLEMENTS_MODE` | `stripe`, `license_file`, `open` | `stripe` | Entitlement checking strategy |

For self-hosted deployments, these are set automatically by Docker Compose / Helm and typically do not need to be changed.

---

## OIDC Authentication

Required when `LAMDIS_AUTH_MODE=oidc`.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OIDC_ISSUER` | Yes | — | IdP issuer URL (e.g., `https://your-org.okta.com`) |
| `OIDC_CLIENT_ID` | Yes | — | OAuth 2.0 client ID |
| `OIDC_CLIENT_SECRET` | Yes | — | OAuth 2.0 client secret |
| `OIDC_AUDIENCE` | No | — | Expected audience claim in tokens |
| `OIDC_JWKS_URI` | No | Auto-discovered | JWKS endpoint URL (overrides discovery) |
| `OIDC_GROUP_CLAIM` | No | `groups` | JWT claim containing user groups |
| `OIDC_ROLE_MAP` | No | `{}` | JSON mapping of IdP groups to Lamdis roles |

### Role Mapping

`OIDC_ROLE_MAP` maps your IdP's group names to Lamdis roles (`admin`, `member`, `viewer`):

```json
{
  "engineering-leads": "admin",
  "engineering": "member",
  "qa-team": "member",
  "stakeholders": "viewer"
}
```

Users are assigned the highest-priority matching role. Users with no matching groups default to `viewer`.

---

## License

Required when `LAMDIS_ENTITLEMENTS_MODE=license_file`.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LAMDIS_LICENSE_PATH` | Yes | `/etc/lamdis/license.jwt` | Path to the signed license file |

The license file is a signed JWT containing your tier, limits, and features. See [License Management](license-management.md).

---

## Bootstrap & Admin

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LAMDIS_ADMIN_TOKEN` | Recommended | — | Token for bootstrap and admin API calls |
| `LAMDIS_BOOTSTRAP_FORCE` | No | `false` | Allow re-running bootstrap when orgs exist |

---

## Service-to-Service Auth

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LAMDIS_API_TOKEN` | Yes | — | Shared secret between API and Runs services |

Used by `lamdis-runs` to call internal API endpoints. Must be the same value on both services.

---

## AWS (for AI Test Runs)

Required by `lamdis-runs` to invoke AWS Bedrock models.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AWS_ACCESS_KEY_ID` | Yes | — | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Yes | — | AWS secret key |
| `AWS_REGION` | No | `us-east-1` | AWS region for Bedrock |

---

## Database

| Variable | Service | Default | Description |
|----------|---------|---------|-------------|
| `MONGODB_URI` | API | `mongodb://mongo:27017/lamdis` | MongoDB connection string |
| `MONGO_URL` | Runs | `mongodb://mongo:27017/lamdis` | MongoDB connection string |

When using the bundled MongoDB (Docker Compose or Helm with `mongodb.enabled=true`), these are set automatically. For external MongoDB, provide your connection string.

---

## Ports

Docker Compose only — customize host port bindings.

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` | `3001` | API service host port |
| `WEB_PORT` | `3000` | Web dashboard host port |
| `RUNS_PORT` | `3101` | Runs service host port |
| `MONGO_PORT` | `27017` | MongoDB host port |

---

## Version Pinning

| Variable | Default | Description |
|----------|---------|-------------|
| `LAMDIS_VERSION` | `latest` | Docker image tag for all services |

Recommended: pin to a specific release version (e.g., `1.0.0`) in production.

---

## Helm-Specific Values

See `helm/lamdis/values.yaml` for the complete Helm values reference, including:

- `global.*` — deployment mode, image registry, image tag
- `api.*`, `web.*`, `runs.*` — replica counts, resources, node selectors
- `mongodb.*` — bundled MongoDB configuration
- `oidc.*` — OIDC settings
- `license.*` — license secret reference
- `ingress.*` — Ingress controller settings
