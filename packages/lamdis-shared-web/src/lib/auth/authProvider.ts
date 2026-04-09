import type { NextRequest, NextResponse } from 'next/server';

/**
 * Abstract auth provider interface.
 * Both Auth0 (cloud) and OIDC (self-hosted) implement this,
 * so the rest of the app doesn't need to know which is active.
 */
export interface AuthSession {
  user: {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
    [key: string]: any;
  };
}

export interface AuthProvider {
  /** Process auth-related middleware (login, callback, logout routes) */
  middleware(request: NextRequest): Promise<NextResponse | null>;
  /** Get the current user session, or null if not authenticated */
  getSession(): Promise<AuthSession | null>;
  /** Get an access token for API calls */
  getAccessToken(): Promise<{ token: string } | null>;
}
