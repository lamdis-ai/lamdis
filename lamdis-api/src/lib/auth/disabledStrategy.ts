import { env } from '../env.js';
import type { AuthStrategy, AuthenticatedUser } from './authStrategy.js';

/**
 * Disabled / break-glass admin authentication strategy.
 *
 * Used during initial self-hosted setup before OIDC is configured.
 * Accepts a static admin token from LAMDIS_ADMIN_TOKEN env var.
 */
export class DisabledStrategy implements AuthStrategy {
  readonly name = 'disabled';

  private adminToken: string | undefined;

  async initialize(): Promise<void> {
    this.adminToken = env.LAMDIS_ADMIN_TOKEN;
    if (!this.adminToken) {
      console.warn('[Auth] disabled mode active with no LAMDIS_ADMIN_TOKEN — all requests will be unauthenticated');
    }
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    // If an admin token is configured, the bearer must match it
    if (this.adminToken) {
      if (token !== this.adminToken) {
        throw new Error('Invalid admin token');
      }
      return {
        sub: 'admin',
        email: 'admin@localhost',
        name: 'Bootstrap Admin',
        groups: ['admin'],
        raw: { sub: 'admin', authMode: 'disabled' },
      };
    }

    // No admin token configured — accept any request as an anonymous admin.
    // This is only intended for initial bootstrapping and must be replaced with OIDC.
    return {
      sub: 'anonymous',
      email: undefined,
      name: 'Anonymous',
      groups: ['admin'],
      raw: { sub: 'anonymous', authMode: 'disabled' },
    };
  }
}
