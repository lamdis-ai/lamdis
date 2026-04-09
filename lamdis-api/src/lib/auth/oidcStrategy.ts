import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { env } from '../env.js';
import type { AuthStrategy, AuthenticatedUser } from './authStrategy.js';

/**
 * Generic OIDC JWT verification strategy.
 * Works with any standards-compliant IdP (Okta, Azure AD, Keycloak, etc.).
 *
 * JWKS discovery:
 *  1. If OIDC_JWKS_URI is set, use it directly.
 *  2. Otherwise derive from OIDC_ISSUER via .well-known/openid-configuration.
 */
export class OidcStrategy implements AuthStrategy {
  readonly name = 'oidc';

  private client!: jwksClient.JwksClient;
  private issuer!: string;
  private audience: string | undefined;
  private groupClaim!: string;

  async initialize(): Promise<void> {
    this.issuer = env.OIDC_ISSUER!;
    this.audience = env.OIDC_AUDIENCE;
    this.groupClaim = env.OIDC_GROUP_CLAIM;

    let jwksUri = env.OIDC_JWKS_URI;

    if (!jwksUri) {
      // Auto-discover from OpenID Configuration
      const wellKnownUrl = this.issuer.replace(/\/$/, '') + '/.well-known/openid-configuration';
      const res = await fetch(wellKnownUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch OpenID configuration from ${wellKnownUrl}: ${res.status}`);
      }
      const config = (await res.json()) as { jwks_uri: string };
      jwksUri = config.jwks_uri;
      if (!jwksUri) {
        throw new Error(`No jwks_uri found in OpenID configuration at ${wellKnownUrl}`);
      }
    }

    this.client = jwksClient({ jwksUri });
  }

  verify(token: string): Promise<AuthenticatedUser> {
    return new Promise((resolve, reject) => {
      const getKey = (header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) => {
        this.client.getSigningKey(header.kid, (err, key) => {
          const signingKey = (key as any)?.getPublicKey();
          callback(err ?? null, signingKey);
        });
      };

      const verifyOptions: jwt.VerifyOptions = {
        issuer: this.issuer,
        algorithms: ['RS256', 'ES256'],
      };
      if (this.audience) {
        verifyOptions.audience = this.audience;
      }

      jwt.verify(token, getKey as any, verifyOptions, (err, decoded) => {
        if (err) return reject(err);
        const payload = decoded as Record<string, any>;

        // Extract groups from the configurable claim
        let groups: string[] = [];
        const rawGroups = payload[this.groupClaim];
        if (Array.isArray(rawGroups)) {
          groups = rawGroups.map(String);
        } else if (typeof rawGroups === 'string') {
          groups = [rawGroups];
        }

        resolve({
          sub: payload.sub,
          email: payload.email || payload.preferred_username,
          name: payload.name || payload.given_name,
          groups,
          raw: payload,
        });
      });
    });
  }
}
