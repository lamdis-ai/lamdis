# License Management

Lamdis self-hosted uses signed license files to manage entitlements. This guide covers obtaining, installing, and renewing licenses.

---

## License Tiers

| Tier | Users | Runs/Month | Conversations/Month | SSO | SCIM |
|------|-------|-----------|---------------------|-----|------|
| Community | 5 | 200 | 500 | No | No |
| Nonprofit | 25 | 2,000 | 5,000 | Yes | No |
| Design Partner | 50 | 10,000 | 25,000 | Yes | Yes |
| Team | 20 | 5,000 | 10,000 | No | No |
| Business | 100 | 25,000 | 50,000 | Yes | No |
| Enterprise | Unlimited | Unlimited | Unlimited | Yes | Yes |

---

## Obtaining a License

### Community License (Free)

Visit [lamdis.ai/self-hosted](https://lamdis.ai/self-hosted) to get a free Community license. Community licenses are valid for 1 year and include generous limits for small teams.

### Paid Licenses

Contact [sales@lamdis.ai](mailto:sales@lamdis.ai) or visit [lamdis.ai/pricing](https://lamdis.ai/pricing) for Team, Business, and Enterprise licenses.

---

## Installing a License

### Docker Compose

Place the license file in the `docker-compose/` directory:

```bash
cp /path/to/license.jwt docker-compose/license.jwt
docker compose restart api runs
```

### Kubernetes

Create or update the Kubernetes secret:

```bash
# First install
kubectl create secret generic lamdis-license \
  --from-file=license.jwt=./license.jwt

# Update existing
kubectl create secret generic lamdis-license \
  --from-file=license.jwt=./license.jwt \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart pods to pick up the new license
kubectl rollout restart deployment -l app.kubernetes.io/part-of=lamdis
```

---

## Inspecting a License

Use the included validation script to view license details:

```bash
./scripts/validate-license.sh license.jwt
```

Output:

```json
{
  "iss": "lamdis.ai",
  "sub": "cust_abc123",
  "iat": 1709337600,
  "exp": 1740960000,
  "tier": "business",
  "limits": {
    "max_users": 100,
    "max_runs_per_month": 25000,
    "max_conversations_per_month": 50000,
    "max_organizations": 5
  },
  "features": {
    "sso": true,
    "scim": false,
    "advanced_rbac": true,
    "custom_retention": false,
    "audit_export": true,
    "evidence_vault": false
  }
}
```

---

## License Expiry

Lamdis handles license expiry gracefully:

| State | Behavior |
|-------|----------|
| **Valid** | Full access to licensed tier |
| **Expiring soon** (< 30 days) | Yellow warning in dashboard, logs warning |
| **Expired** (grace period, 14 days) | Red warning in dashboard, full access continues |
| **Expired** (past grace period) | Downgrades to Community tier limits |
| **Missing or invalid** | Runs in Community tier |

Lamdis will **never** hard-lock you out. Expired licenses gracefully degrade to Community tier.

---

## Renewing a License

1. Contact [sales@lamdis.ai](mailto:sales@lamdis.ai) or use your customer portal to obtain a renewed license file
2. Replace the existing `license.jwt` with the new file
3. The API automatically reloads the license within 5 minutes, or restart the service for immediate effect

---

## Usage Monitoring

The API exposes usage metrics for license limit tracking:

```bash
# Check entitlement status (requires admin token)
curl -H "x-api-token: YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orgId": "YOUR_ORG_ID"}' \
  http://localhost:3001/internal/entitlements/status
```

Response:

```json
{
  "tier": "business",
  "limits": {
    "max_users": 100,
    "max_runs_per_month": 25000,
    "max_conversations_per_month": 50000
  },
  "usage": {
    "active_users": 42,
    "runs_this_month": 1234,
    "conversations_this_month": 5678
  }
}
```

The web dashboard also shows usage and limit information on the License page.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "License file not found" | Verify `LAMDIS_LICENSE_PATH` and file mount |
| "License signature invalid" | Ensure the file is unmodified from what was provided |
| "Community mode" despite having a license | Check file permissions and path; verify with `validate-license.sh` |
| Usage exceeds limits | Upgrade your license tier or wait for the monthly reset |
