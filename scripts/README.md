# Lamdis Secrets & Variables Sync Script

This script synchronizes secrets and environment variables across:
1. **GitHub Secrets** - AWS credentials for CI/CD workflows
2. **GitHub Variables** - Build-time configuration (NEXT_PUBLIC_* vars for lamdis-web)
3. **AWS Secrets Manager + App Runner** - Runtime environment variables

## Prerequisites

1. **GitHub CLI** (`gh`) installed and available in PATH
   - Install: https://cli.github.com/
   - The script uses the token from `GHTOKEN.txt` (GitHub PAT with `repo` scope)

2. **AWS CLI** configured with credentials that have permissions for:
   - Secrets Manager: `secretsmanager:CreateSecret`, `secretsmanager:UpdateSecret`, `secretsmanager:DescribeSecret`
   - App Runner: `apprunner:DescribeService`, `apprunner:UpdateService`

3. **Node.js 18+**

## Installation

```bash
cd scripts
npm install
```

## Usage

### Sync Everything (Default)
```bash
npm run sync
# or
node sync-secrets.js
```

### Sync GitHub Only
```bash
npm run sync:github
# or
node sync-secrets.js --github
```

### Sync App Runner Only
```bash
npm run sync:apprunner
# or
node sync-secrets.js --apprunner
```

## What Gets Synced

### GitHub Secrets (for all repos)
| Secret | Used For |
|--------|----------|
| `AWS_ACCESS_KEY_ID` | CI/CD workflow AWS authentication |
| `AWS_SECRET_ACCESS_KEY` | CI/CD workflow AWS authentication |

### GitHub Variables (lamdis-web only)
| Variable | Value | Purpose |
|----------|-------|---------|
| `DEV_NEXT_PUBLIC_API_URL` | `https://api-dev.lamdis.ai` | Dev API URL |
| `DEV_NEXT_PUBLIC_AUTH0_AUDIENCE` | `https://api.lamdis.ai` | Dev Auth0 audience |
| `DEV_NEXT_PUBLIC_LAMDIS_API_URL` | `https://api-dev.lamdis.ai` | Dev Lamdis API |
| `PROD_NEXT_PUBLIC_API_URL` | `https://api.lamdis.ai` | Prod API URL |
| `PROD_NEXT_PUBLIC_AUTH0_AUDIENCE` | `https://api.lamdis.ai` | Prod Auth0 audience |
| `PROD_NEXT_PUBLIC_LAMDIS_API_URL` | `https://api.lamdis.ai` | Prod Lamdis API |

### App Runner Services

#### lamdis-runs-prod
- **ARN**: `arn:aws:apprunner:us-east-1:730082756200:service/lamdis-runs-prod/9b905a5792274d959ece5bc70b965b45`
- **Port**: 3101
- **Sensitive vars** (stored in Secrets Manager as `lamdis-runs/prod/<VAR>`):
  - `MONGO_URL`
  - `LAMDIS_API_TOKEN`
  - `LAMDIS_HMAC_SECRET`
  - `ENC_SECRET`
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
- **Plain vars** (stored directly in App Runner):
  - `API_BASE_URL`
  - `AWS_REGION`
  - `BEDROCK_MODEL_ID`
  - `BEDROCK_OPUS_MODEL_ID`
  - `BUILDER_MODEL_ID`

#### lamdis-web-prod
- **ARN**: `arn:aws:apprunner:us-east-1:730082756200:service/lamdis-web-prod/c9a3564a802a438dae1a66d5a5e9fb98`
- **Port**: 3000
- **Sensitive vars** (stored in Secrets Manager as `lamdis-web/prod/<VAR>`):
  - `AUTH0_SECRET`
  - `AUTH0_CLIENT_SECRET`
  - `OPENAI_API_KEY`
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `LOGIN_USERNANE`
  - `LOGIN_PASSWORD`
- **Plain vars** (stored directly in App Runner):
  - `AUTH0_BASE_URL`
  - `AUTH0_ISSUER_BASE_URL`
  - `AUTH0_CLIENT_ID`
  - `AUTH0_SCOPE`
  - `AUTH0_AUDIENCE`
  - `AUTH0_LOGIN_URI`
  - `NEXT_PUBLIC_API_URL`
  - `NEXT_PUBLIC_CLOUDFRONT_BASE`
  - etc.

#### lamdis-api-prod
- **ARN**: `arn:aws:apprunner:us-east-1:730082756200:service/lamdis-api-prod/cc8e31b9e67e4f41a6a2847703daf2ce`
- **Port**: 3001
- **Sensitive vars** (stored in Secrets Manager as `lamdis-api/prod/<VAR>`):
  - `MONGO_URI`
  - `AUTH0_MGMT_CLIENT_SECRET`
  - `STRIPE_SECRET`
  - `STRIPE_WEBHOOK_SECRET`
  - `INGEST_SECRET`
  - `OPENAI_API_KEY`
  - `VARIABLES_SECRET_KEY`
  - `LAMDIS_RUNS_TOKEN`
  - `LAMDIS_RUNS_HMAC_SECRET`
  - `ENC_SECRET`
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
- **Plain vars** (stored directly in App Runner):
  - `AUTH0_ISSUER`
  - `AUTH0_AUDIENCE`
  - `AUTH0_DOMAIN`
  - `AUTH0_MGMT_CLIENT_ID`
  - `STRIPE_PRICE_*`
  - `LAMDIS_DEV_*`
  - etc.

## How It Works

### GitHub Sync

1. Reads GitHub token from `GHTOKEN.txt`
2. Uses GitHub CLI (`gh`) to set secrets and variables
3. Sets AWS credentials as secrets for all three repos
4. Sets NEXT_PUBLIC_* variables for lamdis-web (used during Docker build)

### App Runner Sync

1. Reads environment variables from each service's `.env` file
2. Separates sensitive vs. non-sensitive variables
3. Stores sensitive variables in AWS Secrets Manager under `<service>/prod/<VAR>`
4. Updates App Runner service configuration with:
   - Plain environment variables
   - References to Secrets Manager secrets
5. App Runner automatically restarts to pick up changes

## Important Notes

1. **App Runner updates take several minutes** to complete. Monitor progress in AWS Console.

2. **GitHub repos must exist** and be accessible with the provided token.

3. **Secrets Manager costs** - Each secret stored incurs a small monthly cost (~$0.40/secret/month).

4. **Don't commit GHTOKEN.txt** - It's in `.gitignore` but verify it's not being tracked.

5. **Update the script** when adding new environment variables that need to be synced.

## Troubleshooting

### GitHub CLI not found
```
Error: gh command not found
```
Install GitHub CLI: https://cli.github.com/

### Permission denied for GitHub
```
Error: Must have admin rights to Repository
```
Ensure your GitHub token has `repo` scope and admin access to the repos.

### AWS credentials error
```
Error: CredentialsProviderError
```
Ensure AWS CLI is configured: `aws configure`

### App Runner update fails
```
Error: Failed to update App Runner service
```
Check that:
- The service ARN is correct
- Your AWS credentials have App Runner permissions
- The service exists and is not in a failed state

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GitHub Repos                                  │
├─────────────────────┬─────────────────────┬─────────────────────────┤
│    lamdis-runs      │    lamdis-web       │    lamdis-api           │
│                     │                     │                         │
│ Secrets:            │ Secrets:            │ Secrets:                │
│ - AWS_ACCESS_KEY_ID │ - AWS_ACCESS_KEY_ID │ - AWS_ACCESS_KEY_ID     │
│ - AWS_SECRET_...    │ - AWS_SECRET_...    │ - AWS_SECRET_...        │
│                     │                     │                         │
│ Variables:          │ Variables:          │ Variables:              │
│ (none)              │ - DEV_NEXT_PUBLIC_* │ (none)                  │
│                     │ - PROD_NEXT_PUBLIC_*│                         │
└─────────────────────┴─────────────────────┴─────────────────────────┘
         │                     │                     │
         │ CI/CD Build        │ CI/CD Build         │ CI/CD Build
         ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         AWS ECR                                      │
│              (Docker images pushed here)                             │
└─────────────────────────────────────────────────────────────────────┘
         │                     │                     │
         │ Deploy             │ Deploy              │ Deploy
         ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AWS App Runner                                  │
├─────────────────────┬─────────────────────┬─────────────────────────┤
│  lamdis-runs-prod   │  lamdis-web-prod    │  lamdis-api-prod        │
│                     │                     │                         │
│ Runtime Env Vars:   │ Runtime Env Vars:   │ Runtime Env Vars:       │
│ - Plain vars        │ - Plain vars        │ - Plain vars            │
│ - Secrets (refs)    │ - Secrets (refs)    │ - Secrets (refs)        │
└─────────────────────┴─────────────────────┴─────────────────────────┘
         │                     │                     │
         │ References         │ References          │ References
         ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   AWS Secrets Manager                                │
├─────────────────────┬─────────────────────┬─────────────────────────┤
│ lamdis-runs/prod/*  │ lamdis-web/prod/*   │ lamdis-api/prod/*       │
│                     │                     │                         │
│ - MONGO_URL         │ - AUTH0_SECRET      │ - MONGO_URI             │
│ - LAMDIS_API_TOKEN  │ - AUTH0_CLIENT_...  │ - AUTH0_MGMT_CLIENT_... │
│ - LAMDIS_HMAC_...   │ - OPENAI_API_KEY    │ - STRIPE_SECRET         │
│ - ENC_SECRET        │ - AWS_*             │ - STRIPE_WEBHOOK_...    │
│ - AWS_*             │ - LOGIN_*           │ - INGEST_SECRET         │
│                     │                     │ - OPENAI_API_KEY        │
│                     │                     │ - VARIABLES_SECRET_KEY  │
│                     │                     │ - LAMDIS_RUNS_*         │
│                     │                     │ - ENC_SECRET            │
│                     │                     │ - AWS_*                 │
└─────────────────────┴─────────────────────┴─────────────────────────┘
```

## GitHub vs App Runner: Which Variables Go Where?

| Type | GitHub | App Runner | Notes |
|------|--------|------------|-------|
| AWS credentials for CI/CD | ✅ Secret | ❌ | Used by workflows to push to ECR |
| NEXT_PUBLIC_* (build-time) | ✅ Variable | ❌ | Baked into Next.js bundle at build time |
| Runtime secrets | ❌ | ✅ Secrets Manager | Loaded at container startup |
| Runtime config | ❌ | ✅ Plain env var | Non-sensitive runtime config |

## Modifying the Script

### Adding a new environment variable

1. Add the variable to the appropriate `.env` file
2. If it's sensitive, add it to the `sensitiveVars` array in the script
3. Re-run the sync script

### Adding a new service

1. Add the service configuration to `GITHUB_REPOS` and/or `APPRUNNER_SERVICES`
2. Create the `.env` file for the service
3. Re-run the sync script