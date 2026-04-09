import { authMode } from '../deploymentMode.js';
import type { AuthStrategy } from './authStrategy.js';
import { Auth0Strategy } from './auth0Strategy.js';
import { OidcStrategy } from './oidcStrategy.js';
import { DisabledStrategy } from './disabledStrategy.js';

/**
 * Factory: creates the correct auth strategy based on LAMDIS_AUTH_MODE.
 */
export function createAuthStrategy(): AuthStrategy {
  switch (authMode) {
    case 'auth0':
      return new Auth0Strategy();
    case 'oidc':
      return new OidcStrategy();
    case 'saml':
      // SAML support can reuse the OIDC strategy if the IdP issues JWTs,
      // or a dedicated SamlStrategy can be added later.
      throw new Error('SAML auth mode is not yet implemented. Use OIDC for now.');
    case 'disabled':
      return new DisabledStrategy();
    default:
      throw new Error(`Unknown LAMDIS_AUTH_MODE: ${authMode}`);
  }
}

export type { AuthStrategy, AuthenticatedUser } from './authStrategy.js';
export { mapGroupsToRole, isAdminGroup } from './groupMapping.js';
