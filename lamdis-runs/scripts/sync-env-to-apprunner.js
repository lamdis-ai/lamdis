#!/usr/bin/env node

/**
 * Sync Environment Variables to AWS Secrets Manager and App Runner
 * 
 * This script:
 * 1. Reads environment variables from lamdis-runs/.env
 * 2. Stores them in AWS Secrets Manager (checking for existing secrets)
 * 3. Updates the App Runner service to reference these secrets
 * 
 * Usage: node scripts/sync-env-to-apprunner.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  SecretsManagerClient, 
  CreateSecretCommand, 
  UpdateSecretCommand,
  DescribeSecretCommand
} from '@aws-sdk/client-secrets-manager';
import { 
  AppRunnerClient, 
  DescribeServiceCommand,
  UpdateServiceCommand 
} from '@aws-sdk/client-apprunner';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const ENV_FILE = path.join(__dirname, '..', '.env');
const SECRET_PREFIX = 'lamdis-runs/prod';
const APP_RUNNER_ARN = 'arn:aws:apprunner:us-east-1:730082756200:service/lamdis-runs-prod/9b905a5792274d959ece5bc70b965b45';
const AWS_REGION = 'us-east-1';

// Production overrides - these values are always used in production regardless of local .env
// This prevents accidentally syncing localhost URLs to production
const PRODUCTION_OVERRIDES = {
  API_BASE_URL: 'https://api.lamdis.ai',
  // Add other production-specific overrides here if needed
};

// Initialize AWS clients
const secretsClient = new SecretsManagerClient({ region: AWS_REGION });
const appRunnerClient = new AppRunnerClient({ region: AWS_REGION });

// Define which env vars are sensitive (all will go in Secrets Manager, but we'll note which are critical)
const SENSITIVE_VARS = [
  'MONGO_URL',
  'LAMDIS_API_TOKEN',
  'LAMDIS_HMAC_SECRET',
  'ENC_SECRET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY'
];

/**
 * Parse .env file into key-value pairs
 */
function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const env = {};
  
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    
    // Parse KEY=VALUE
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) {
      const key = match[1];
      let value = match[2].trim();
      
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      env[key] = value;
    }
  }
  
  return env;
}

/**
 * Check if a secret exists
 */
async function secretExists(secretName) {
  try {
    await secretsClient.send(new DescribeSecretCommand({
      SecretId: secretName
    }));
    return true;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

/**
 * Store a secret in Secrets Manager and return its ARN
 */
async function storeSecret(key, value) {
  const secretName = `${SECRET_PREFIX}/${key}`;
  const exists = await secretExists(secretName);
  
  const isSensitive = SENSITIVE_VARS.includes(key);
  const description = `${key} for lamdis-runs production${isSensitive ? ' (sensitive)' : ''}`;
  
  try {
    let response;
    if (exists) {
      // Update existing secret
      response = await secretsClient.send(new UpdateSecretCommand({
        SecretId: secretName,
        SecretString: value,
        Description: description
      }));
      console.log(`✅ Updated secret: ${secretName}`);
    } else {
      // Create new secret
      response = await secretsClient.send(new CreateSecretCommand({
        Name: secretName,
        SecretString: value,
        Description: description
      }));
      console.log(`✅ Created secret: ${secretName}`);
    }
    
    // Get the full ARN
    const describeResponse = await secretsClient.send(new DescribeSecretCommand({
      SecretId: secretName
    }));
    
    return describeResponse.ARN;
  } catch (error) {
    console.error(`❌ Failed to store ${secretName}:`, error.message);
    throw error;
  }
}

/**
 * Get current App Runner service configuration
 */
async function getAppRunnerService() {
  const command = new DescribeServiceCommand({
    ServiceArn: APP_RUNNER_ARN
  });
  
  const response = await appRunnerClient.send(command);
  return response.Service;
}

/**
 * Update App Runner service with Secrets Manager references and plain env vars
 */
async function updateAppRunnerService(secretArns, plainVars, port) {
  console.log('\n📋 Fetching current App Runner service configuration...');
  const service = await getAppRunnerService();
  
  console.log(`\n🔧 Updating App Runner service with:`);
  console.log(`   ${Object.keys(secretArns).length} secrets (Secrets Manager)`);
  console.log(`   ${Object.keys(plainVars).length} plain variables`);
  console.log(`   Port: ${port}`);
  
  const updateCommand = new UpdateServiceCommand({
    ServiceArn: APP_RUNNER_ARN,
    SourceConfiguration: {
      ImageRepository: {
        ImageIdentifier: service.SourceConfiguration.ImageRepository.ImageIdentifier,
        ImageRepositoryType: service.SourceConfiguration.ImageRepository.ImageRepositoryType,
        ImageConfiguration: {
          RuntimeEnvironmentVariables: plainVars,
          RuntimeEnvironmentSecrets: secretArns,
          Port: port
        }
      }
    }
  });
  
  try {
    const response = await appRunnerClient.send(updateCommand);
    console.log('✅ App Runner service update initiated');
    console.log(`   Operation ID: ${response.OperationId}`);
    console.log(`   Service Status: ${response.Service.Status}`);
    console.log('\n⏳ Note: The service update will take a few minutes to complete.');
    console.log('   You can check status in the AWS Console or use AWS CLI.');
  } catch (error) {
    console.error('❌ Failed to update App Runner service:', error.message);
    console.error('Error details:', JSON.stringify(error, null, 2));
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Syncing Environment Variables to AWS Secrets Manager and App Runner\n');
  console.log(`📄 Reading .env file: ${ENV_FILE}`);
  
  // Parse .env file
  const envVars = parseEnvFile(ENV_FILE);
  const varCount = Object.keys(envVars).length;
  console.log(`✅ Found ${varCount} environment variables\n`);
  
  // Apply production overrides
  console.log('🔒 Applying production overrides...');
  for (const [key, value] of Object.entries(PRODUCTION_OVERRIDES)) {
    const oldValue = envVars[key];
    envVars[key] = value;
    if (oldValue && oldValue !== value) {
      console.log(`   ⚠️  ${key}: "${oldValue}" → "${value}" (production override)`);
    } else {
      console.log(`   ✅ ${key}: "${value}"`);
    }
  }
  console.log('');
  
  // Separate sensitive vs non-sensitive variables
  console.log('💾 Processing environment variables...\n');
  const secretArns = {};
  const plainVars = {};
  let port = '3101';
  
  for (const [key, value] of Object.entries(envVars)) {
    if (key === 'PORT') {
      // PORT is handled via ImageConfiguration.Port, not as an env var
      port = value;
      console.log(`✅ Set port: ${port}`);
      continue;
    }
    
    if (SENSITIVE_VARS.includes(key)) {
      // Store sensitive variables in Secrets Manager
      const arn = await storeSecret(key, value);
      secretArns[key] = arn;
    } else {
      // Keep non-sensitive variables as plain env vars
      plainVars[key] = value;
      console.log(`✅ Set plain variable: ${key}`);
    }
  }
  
  // Update App Runner
  await updateAppRunnerService(secretArns, plainVars, port);
  
  console.log('\n✨ Sync complete!');
  console.log('\nNext steps:');
  console.log('1. Monitor the App Runner deployment in AWS Console');
  console.log('2. Once deployed, verify the service is running correctly');
  console.log('3. Check logs to ensure environment variables are properly loaded');
  console.log('\n📝 Note: All secrets are stored in AWS Secrets Manager under:');
  console.log(`   ${SECRET_PREFIX}/<ENV_VAR_NAME>`);
}

// Run the script
main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});