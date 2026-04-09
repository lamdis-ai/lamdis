import { NextRequest, NextResponse } from "next/server";

// Lightweight auth routes — Auth0 SDK constructor blocks on startup.
// These handle login redirect and callback without importing the SDK.

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const segments = url.pathname.replace('/api/auth/', '').split('/');
  const action = segments[0];

  if (action === 'login') {
    const returnTo = url.searchParams.get('returnTo') || '/dashboard';
    const issuer = process.env.AUTH0_ISSUER_BASE_URL;
    const clientId = process.env.AUTH0_CLIENT_ID;
    const redirectUri = `${process.env.AUTH0_BASE_URL}/api/auth/callback`;
    const audience = process.env.AUTH0_AUDIENCE || '';
    const scope = 'openid profile email offline_access';

    const authUrl = `${issuer}/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&audience=${encodeURIComponent(audience)}&state=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(authUrl);
  }

  if (action === 'callback') {
    // Auth0 redirects back with ?code=...&state=...
    // We need the SDK to exchange the code for tokens — lazy import it here
    try {
      const { auth0 } = await import("@/lib/auth0");
      const res = await auth0.handleCallback(request);
      return res;
    } catch (err: any) {
      console.error('[Auth0 Callback Error]', err?.message);
      // Fallback: redirect to dashboard
      const state = url.searchParams.get('state') || '/dashboard';
      return NextResponse.redirect(new URL(state, request.url));
    }
  }

  if (action === 'logout') {
    const issuer = process.env.AUTH0_ISSUER_BASE_URL;
    const clientId = process.env.AUTH0_CLIENT_ID;
    const returnTo = process.env.AUTH0_BASE_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${issuer}/v2/logout?client_id=${clientId}&returnTo=${encodeURIComponent(returnTo)}`);
  }

  if (action === 'me') {
    try {
      const { auth0 } = await import("@/lib/auth0");
      const session = await auth0.getSession(request);
      if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      return NextResponse.json({ user: session.user });
    } catch {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
  }

  return NextResponse.json({ error: "Unknown auth route" }, { status: 404 });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
