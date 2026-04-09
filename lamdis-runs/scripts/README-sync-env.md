# Environment Variable Sync Script

This script synchronizes environment variables from your local `.env` file to AWS Secrets Manager and configures your App Runner service to use them.

## What It Does

1. **Reads** environment variables from `lamdis-runs/.env`
2. **Stores** them in AWS Secrets Manager under `lamdis-runs/prod/`
3. **Updates** your App Runner service to reference these secrets
4. **Checks** for existing secrets before overwriting

## Prerequisites

- AWS credentials configured (the script uses your default AWS credentials)
- Admin permissions on AWS account (730082756200)
- Node.js installed
- The required npm packages (already installed via devDependencies)

## Environment Variables

All environment variables from your `.env` file will be stored in AWS Secrets Manager:

### Sensitive Variables (marked as sensitive)
- `MONGO_URL` - MongoDB connection string
- `LAMDIS_API_TOKEN` - Shared authentication token
- `LAMDIS_HMAC_SECRET` - HMAC secret for API calls
- `ENC_SECRET` - Encryption secret
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key

### Other Variables
- `PORT`
- `API_BASE_URL`
- `AWS_REGION`
- `BEDROCK_MODEL_ID`
- `BEDROCK_OPUS_MODEL_ID`
- `BUILDER_MODEL_ID`

All variables are stored in Secrets Manager for consistency and security.

## Usage

From the `lamdis-runs` directory:

```bash
node scripts/sync-env-to-apprunner.js
```

## What Happens

1. The script parses your `.env` file
2. For each environment variable:
   - Checks if the secret already exists in Secrets Manager
   - Creates or updates the secret
   - Tags sensitive variables appropriately
3. Fetches current App Runner service configuration
4. Updates the service with Secrets Manager ARN references
5. Initiates a deployment (takes a few minutes)

## Output Example

```
🚀 Syncing Environment Variables to AWS Secrets Manager and App Runner

📄 Reading .env file: /path/to/lamdis-runs/.env
✅ Found 13 environment variables

💾 Storing secrets in AWS Secrets Manager...

✅ Updated secret: lamdis-runs/prod/MONGO_URL
✅ Created secret: lamdis-runs/prod/PORT
✅ Updated secret: lamdis-runs/prod/LAMDIS_API_TOKEN
...

📋 Fetching current App Runner service configuration...

🔧 Updating App Runner service with 13 secret references...
✅ App Runner service update initiated
   Operation ID: abc123def456
   Service Status: OPERATION_IN_PROGRESS

⏳ Note: The service update will take a few minutes to complete.
   You can check status in the AWS Console or use AWS CLI.

✨ Sync complete!

Next steps:
1. Monitor the App Runner deployment in AWS Console
2. Once deployed, verify the service is running correctly
3. Check logs to ensure environment variables are properly loaded

📝 Note: All secrets are stored in AWS Secrets Manager under:
   lamdis-runs/prod/<ENV_VAR_NAME>
```

## Secret Naming Convention

Secrets are stored with the following pattern:
- `lamdis-runs/prod/MONGO_URL`
- `lamdis-runs/prod/LAMDIS_API_TOKEN`
- `lamdis-runs/prod/PORT`
- etc.

## App Runner Configuration

The script automatically configures App Runner to:
- Reference secrets by their full ARN: `arn:aws:secretsmanager:us-east-1:730082756200:secret:lamdis-runs/prod/<VAR_NAME>`
- Inject them as environment variables at runtime
- The App Runner service ARN is: `arn:aws:apprunner:us-east-1:730082756200:service/lamdis-runs-prod/9b905a5792274d959ece5bc70b965b45`

## Troubleshooting

### Permission Errors
If you get permission errors, ensure your AWS credentials have:
- `secretsmanager:CreateSecret`
- `secretsmanager:UpdateSecret`
- `secretsmanager:DescribeSecret`
- `apprunner:DescribeService`
- `apprunner:UpdateService`

### Deployment Failed
- Check the App Runner console for deployment logs
- Verify all secrets were created successfully in Secrets Manager
- Ensure the secret ARNs are correct

### Environment Variables Not Loading
- Check App Runner logs in CloudWatch
- Verify the service has IAM permissions to access Secrets Manager
- Ensure the secret names match exactly

## Security Notes

- **Never commit `.env` files to git**
- All secrets are encrypted at rest in AWS Secrets Manager
- App Runner injects secrets as environment variables at runtime
- The service IAM role needs `secretsmanager:GetSecretValue` permission

## Updating Variables

To update environment variables:
1. Update your local `.env` file
2. Run the script again: `node scripts/sync-env-to-apprunner.js`
3. The script will update existing secrets and trigger a new deployment

## Manual Secret Management

You can also manage secrets manually:

```bash
# View a secret
aws secretsmanager get-secret-value --secret-id lamdis-runs/prod/MONGO_URL

# Update a secret
aws secretsmanager update-secret --secret-id lamdis-runs/prod/PORT --secret-string "3101"

# Delete a secret (careful!)
aws secretsmanager delete-secret --secret-id lamdis-runs/prod/OLD_VAR --force-delete-without-recovery
```

## Cost Considerations

AWS Secrets Manager pricing (as of 2026):
- $0.40 per secret per month
- $0.05 per 10,000 API calls

For 13 secrets: approximately $5.20/month