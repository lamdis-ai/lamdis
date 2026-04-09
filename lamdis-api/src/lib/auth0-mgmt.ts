/**
 * Auth0 Management API Client
 * 
 * Used for managing Auth0 Organizations, invitations, and members.
 * Requires M2M application credentials with appropriate scopes.
 */
import { ManagementClient } from 'auth0';
import { env } from './env.js';

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

let _client: ManagementClient | null = null;

/**
 * Get or create the Auth0 Management client.
 * Lazily initialized to allow app to start even if Management API not configured.
 */
export function getAuth0Mgmt(): ManagementClient {
  if (_client) return _client;
  
  const domain = required('AUTH0_DOMAIN', env.AUTH0_DOMAIN);
  const clientId = required('AUTH0_MGMT_CLIENT_ID', env.AUTH0_MGMT_CLIENT_ID);
  const clientSecret = required('AUTH0_MGMT_CLIENT_SECRET', env.AUTH0_MGMT_CLIENT_SECRET);
  
  // Debug logging (remove after fixing)
  console.log('[Auth0 Mgmt] Initializing with:', {
    domain,
    clientId: clientId.slice(0, 8) + '...',
    clientSecretLen: clientSecret.length,
    audience: `https://${domain}/api/v2/`,
  });
  
  _client = new ManagementClient({
    domain,
    clientId,
    clientSecret,
    audience: `https://${domain}/api/v2/`,
  });
  
  return _client;
}

/**
 * Check if Auth0 Management API is configured
 */
export function isAuth0MgmtConfigured(): boolean {
  return Boolean(
    env.AUTH0_DOMAIN &&
    env.AUTH0_MGMT_CLIENT_ID &&
    env.AUTH0_MGMT_CLIENT_SECRET
  );
}

/**
 * Get the default connection ID for enabling on organizations
 */
export function getDefaultConnectionId(): string {
  return required('AUTH0_DEFAULT_CONNECTION_ID', env.AUTH0_DEFAULT_CONNECTION_ID);
}

/**
 * Get the app client ID for invitations
 */
export function getAppClientId(): string {
  return required('AUTH0_APP_CLIENT_ID', env.AUTH0_APP_CLIENT_ID);
}
