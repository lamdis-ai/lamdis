import type { AuthProvider } from './authProvider';
import { Auth0Provider } from './auth0Provider';
import { OidcProvider } from './oidcProvider';

const authMode = process.env.NEXT_PUBLIC_LAMDIS_AUTH_MODE || 'auth0';

let _provider: AuthProvider | null = null;

/**
 * Creates the auth provider based on NEXT_PUBLIC_LAMDIS_AUTH_MODE.
 * Returns Auth0Provider for cloud, OidcProvider for self-hosted.
 */
export function createAuthProvider(): AuthProvider {
  if (_provider) return _provider;

  switch (authMode) {
    case 'oidc':
    case 'saml':
      _provider = new OidcProvider();
      break;
    case 'disabled':
      // In disabled mode, use OIDC provider which will degrade gracefully
      _provider = new OidcProvider();
      break;
    case 'auth0':
    default:
      _provider = new Auth0Provider();
      break;
  }

  return _provider;
}

export type { AuthProvider, AuthSession } from './authProvider';
