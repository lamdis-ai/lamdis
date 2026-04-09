import { createAuthProvider } from './auth/index';

const authMode = process.env.NEXT_PUBLIC_LAMDIS_AUTH_MODE || 'auth0';

// Log auth configuration for debugging (non-sensitive values only)
if (typeof window === 'undefined') {
  console.log('[Auth Config]', {
    AUTH_MODE: authMode,
    DEPLOYMENT_MODE: process.env.NEXT_PUBLIC_LAMDIS_DEPLOYMENT_MODE || 'cloud',
    ...(authMode === 'auth0'
      ? {
          AUTH0_BASE_URL: process.env.AUTH0_BASE_URL || 'NOT SET',
          AUTH0_ISSUER_BASE_URL: process.env.AUTH0_ISSUER_BASE_URL || 'NOT SET',
          AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID ? 'SET' : 'NOT SET',
          AUTH0_SECRET: process.env.AUTH0_SECRET ? 'SET' : 'NOT SET',
          AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET ? 'SET' : 'NOT SET',
          AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE || 'NOT SET',
        }
      : {
          OIDC_ISSUER: process.env.OIDC_ISSUER || 'NOT SET',
          OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID ? 'SET' : 'NOT SET',
        }),
  });
}

/**
 * Auth provider instance.
 *
 * The export is named `auth0` for backward compatibility — all 43+ importing
 * files use this name. The actual implementation may be Auth0 (cloud) or
 * OIDC (self-hosted), selected by NEXT_PUBLIC_LAMDIS_AUTH_MODE.
 */
export const auth0 = createAuthProvider();

// Helper to get session - wraps provider API for easier migration
export async function getSession() {
  return auth0.getSession();
}

// Helper to get access token - wraps provider API
export async function getAccessToken() {
  return auth0.getAccessToken();
}
