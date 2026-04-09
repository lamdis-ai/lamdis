# Upgrading

This guide covers how to upgrade your Lamdis self-hosted deployment to a new version.

---

## Version Scheme

Lamdis uses semantic versioning (`MAJOR.MINOR.PATCH`):

- **Major** — Breaking changes (rare, with migration guides)
- **Minor** — New features, backward compatible
- **Patch** — Bug fixes and security updates

All three services (API, Web, Runs) share the same version number and should always be upgraded together.

---

## Check Current Version

```bash
# Docker Compose — check running image tags
docker compose ps --format json | jq '.[].Image'

# Kubernetes
kubectl get deployments -l app.kubernetes.io/part-of=lamdis \
  -o jsonpath='{range .items[*]}{.metadata.name}: {.spec.template.spec.containers[0].image}{"\n"}{end}'
```

---

## Upgrade Steps

### Docker Compose

1. **Review the changelog** at [github.com/lamdis-ai/lamdis-deploy/releases](https://github.com/lamdis-ai/lamdis-deploy/releases)

2. **Update the version** in `.env`:
   ```env
   LAMDIS_VERSION=1.1.0
   ```

3. **Pull new images**:
   ```bash
   docker compose pull
   ```

4. **Apply the update**:
   ```bash
   docker compose up -d
   ```

5. **Verify health**:
   ```bash
   ./scripts/health-check.sh
   ```

### Kubernetes (Helm)

1. **Review the changelog**

2. **Update the chart** (if using a Helm repository):
   ```bash
   helm repo update
   ```

3. **Upgrade**:
   ```bash
   helm upgrade lamdis ./helm/lamdis \
     --set global.imageTag=1.1.0
   ```

4. **Monitor the rollout**:
   ```bash
   kubectl rollout status deployment -l app.kubernetes.io/part-of=lamdis
   ```

---

## Rolling Back

### Docker Compose

```bash
# Set the previous version
LAMDIS_VERSION=1.0.0 docker compose up -d
```

### Kubernetes

```bash
# Helm rollback to previous release
helm rollback lamdis

# Or rollback to a specific revision
helm history lamdis
helm rollback lamdis 3
```

---

## Database Migrations

Lamdis handles database migrations automatically on startup. When upgrading:

- **Forward migrations** run automatically when the API starts
- **No manual migration steps** are required
- **Backward compatibility** is maintained for one minor version (1.1 can read 1.0 data)

If a major version includes a breaking schema change, the release notes will include specific migration instructions.

---

## Upgrade Checklist

- [ ] Read the release notes for breaking changes
- [ ] Back up your MongoDB database
- [ ] Update `LAMDIS_VERSION` or Helm `imageTag`
- [ ] Pull / deploy new images
- [ ] Verify all services are healthy
- [ ] Test login and basic functionality
- [ ] Check the dashboard for any warnings
