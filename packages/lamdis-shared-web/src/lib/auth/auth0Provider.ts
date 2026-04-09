import { Auth0Client } from '@auth0/nextjs-auth0/server';
import type { AuthProvider, AuthSession } from './authProvider';

/**
 * Auth0 provider — wraps the existing @auth0/nextjs-auth0 client.
 * Used when NEXT_PUBLIC_LAMDIS_AUTH_MODE=auth0 (cloud mode).
 */
export class Auth0Provider implements AuthProvider {
  private client: Auth0Client;

  constructor() {
    const audience = process.env.AUTH0_AUDIENCE;
    const scope = process.env.AUTH0_SCOPE || 'openid profile email';

    this.client = new Auth0Client({
      appBaseUrl: process.env.AUTH0_BASE_URL,
      domain: process.env.AUTH0_DOMAIN || process.env.AUTH0_ISSUER_BASE_URL?.replace('https://', ''),
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      secret: process.env.AUTH0_SECRET,
      authorizationParameters: {
        audience,
        scope,
      },
      routes: {
        login: '/api/auth/login',
        logout: '/api/auth/logout',
        callback: '/api/auth/callback',
      },
    });
  }

  async middleware(request: any): Promise<any> {
    return this.client.middleware(request);
  }

  async getSession(): Promise<AuthSession | null> {
    const session = await this.client.getSession();
    if (!session) return null;
    return {
      user: {
        sub: (session as any).user?.sub,
        email: (session as any).user?.email,
        name: (session as any).user?.name,
        picture: (session as any).user?.picture,
        ...(session as any).user,
      },
    };
  }

  async getAccessToken(): Promise<{ token: string } | null> {
    return this.client.getAccessToken();
  }
}
