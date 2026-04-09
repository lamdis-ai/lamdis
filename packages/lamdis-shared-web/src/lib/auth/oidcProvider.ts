import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { AuthProvider, AuthSession } from './authProvider';

/**
 * Lightweight OIDC provider for self-hosted deployments.
 *
 * In self-hosted mode, the frontend proxies all API calls through Next.js
 * server-side routes, which add the access token from the session cookie.
 *
 * This provider implements the same interface as Auth0Provider so the
 * rest of the app is unaware of the auth mechanism.
 *
 * The OIDC authorization code flow is handled by:
 *   /api/auth/login    → redirect to IdP
 *   /api/auth/callback → exchange code for tokens, set session cookie
 *   /api/auth/logout   → clear session, redirect to IdP logout
 *
 * For the MVP, the actual OIDC code exchange is handled by the API
 * server-side route handlers. This provider manages the session cookie
 * and delegates to those routes.
 *
 * TODO: Implement full OIDC code exchange using `openid-client` when
 * the `openid-client` dependency is added.
 */
export class OidcProvider implements AuthProvider {
  private sessionCookieName = 'lamdis_session';

  async middleware(request: NextRequest): Promise<NextResponse | null> {
    const { pathname } = request.nextUrl;

    // Handle auth routes
    if (pathname === '/api/auth/login') {
      return this.handleLogin(request);
    }
    if (pathname === '/api/auth/callback') {
      return this.handleCallback(request);
    }
    if (pathname === '/api/auth/logout') {
      return this.handleLogout(request);
    }

    return null;
  }

  async getSession(): Promise<AuthSession | null> {
    // In self-hosted mode with OIDC, the session is stored in a cookie
    // set during the callback flow. For the MVP, we read the API-proxied
    // session from the Next.js cookie.
    //
    // TODO: Replace with proper cookie-based session reading once
    // openid-client is integrated.
    try {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get(this.sessionCookieName);
      if (!sessionCookie?.value) return null;

      const session = JSON.parse(
        Buffer.from(sessionCookie.value, 'base64').toString('utf-8'),
      );
      return { user: session.user };
    } catch {
      return null;
    }
  }

  async getAccessToken(): Promise<{ token: string } | null> {
    try {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get(this.sessionCookieName);
      if (!sessionCookie?.value) return null;

      const session = JSON.parse(
        Buffer.from(sessionCookie.value, 'base64').toString('utf-8'),
      );
      if (!session.accessToken) return null;
      return { token: session.accessToken };
    } catch {
      return null;
    }
  }

  private handleLogin(request: NextRequest): NextResponse {
    const issuer = process.env.OIDC_ISSUER;
    const clientId = process.env.OIDC_CLIENT_ID;
    const baseUrl = process.env.AUTH0_BASE_URL || process.env.NEXTAUTH_URL || request.nextUrl.origin;
    const returnTo = request.nextUrl.searchParams.get('returnTo') || '/dashboard';

    if (!issuer || !clientId) {
      return NextResponse.json(
        { error: 'OIDC not configured. Set OIDC_ISSUER and OIDC_CLIENT_ID.' },
        { status: 500 },
      );
    }

    // Build the OIDC authorization URL
    const authUrl = new URL(`${issuer.replace(/\/$/, '')}/authorize`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', `${baseUrl}/api/auth/callback`);
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('state', Buffer.from(JSON.stringify({ returnTo })).toString('base64'));

    return NextResponse.redirect(authUrl.toString());
  }

  private async handleCallback(request: NextRequest): Promise<NextResponse> {
    const code = request.nextUrl.searchParams.get('code');
    const stateParam = request.nextUrl.searchParams.get('state');

    let returnTo = '/dashboard';
    if (stateParam) {
      try {
        const state = JSON.parse(Buffer.from(stateParam, 'base64').toString('utf-8'));
        returnTo = state.returnTo || '/dashboard';
      } catch {
        // Invalid state, use default
      }
    }

    if (!code) {
      return NextResponse.redirect(new URL('/api/auth/login', request.url));
    }

    const issuer = process.env.OIDC_ISSUER!;
    const clientId = process.env.OIDC_CLIENT_ID!;
    const clientSecret = process.env.OIDC_CLIENT_SECRET!;
    const baseUrl = process.env.AUTH0_BASE_URL || process.env.NEXTAUTH_URL || request.nextUrl.origin;

    // Exchange the authorization code for tokens
    const tokenUrl = `${issuer.replace(/\/$/, '')}/oauth/token`;
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${baseUrl}/api/auth/callback`,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      console.error('[OIDC] Token exchange failed:', await tokenRes.text());
      return NextResponse.redirect(new URL('/api/auth/login', request.url));
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      id_token?: string;
      expires_in?: number;
    };

    // Decode the ID token to get user info (no verification needed — we trust the IdP response)
    let user: Record<string, any> = { sub: 'unknown' };
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokens.id_token.split('.')[1], 'base64').toString('utf-8'),
        );
        user = {
          sub: payload.sub,
          email: payload.email,
          name: payload.name,
          picture: payload.picture,
        };
      } catch {
        // Fall back to userinfo endpoint
      }
    }

    // Store session in a cookie
    const sessionData = {
      user,
      accessToken: tokens.access_token,
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    };
    const cookieValue = Buffer.from(JSON.stringify(sessionData)).toString('base64');

    const response = NextResponse.redirect(new URL(returnTo, request.url));
    response.cookies.set(this.sessionCookieName, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: tokens.expires_in || 3600,
    });

    return response;
  }

  private handleLogout(request: NextRequest): NextResponse {
    const baseUrl = process.env.AUTH0_BASE_URL || process.env.NEXTAUTH_URL || request.nextUrl.origin;

    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.delete(this.sessionCookieName);

    // If IdP has a logout endpoint, redirect there
    const issuer = process.env.OIDC_ISSUER;
    if (issuer) {
      const logoutUrl = new URL(`${issuer.replace(/\/$/, '')}/v2/logout`);
      logoutUrl.searchParams.set('client_id', process.env.OIDC_CLIENT_ID || '');
      logoutUrl.searchParams.set('returnTo', baseUrl);
      // Note: Not all IdPs use /v2/logout — this is a best-effort redirect
    }

    return response;
  }
}
