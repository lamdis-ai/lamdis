import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { env } from '../env.js';
import type { AuthStrategy, AuthenticatedUser } from './authStrategy.js';

/**
 * Auth0 JWT verification strategy.
 * Identical to the original hardcoded logic in plugins/auth.ts —
 * validates RS256 tokens against the Auth0 JWKS endpoint.
 */
export class Auth0Strategy implements AuthStrategy {
  readonly name = 'auth0';

  private client!: jwksClient.JwksClient;

  async initialize(): Promise<void> {
    this.client = jwksClient({
      jwksUri: `${env.AUTH0_ISSUER}.well-known/jwks.json`,
    });
  }

  verify(token: string): Promise<AuthenticatedUser> {
    return new Promise((resolve, reject) => {
      const getKey = (header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) => {
        this.client.getSigningKey(header.kid, (err, key) => {
          const signingKey = (key as any)?.getPublicKey();
          callback(err ?? null, signingKey);
        });
      };

      jwt.verify(
        token,
        getKey as any,
        {
          audience: env.AUTH0_AUDIENCE,
          issuer: env.AUTH0_ISSUER,
          algorithms: ['RS256'],
        },
        (err, decoded) => {
          if (err) return reject(err);
          const payload = decoded as Record<string, any>;
          resolve({
            sub: payload.sub,
            email: payload.email || payload['https://lamdis.ai/email'],
            name: payload.name || payload['https://lamdis.ai/name'],
            org_id: payload.org_id,
            groups: payload['https://lamdis.ai/roles'] || [],
            raw: payload,
          });
        },
      );
    });
  }
}
