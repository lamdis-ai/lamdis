import { NextResponse } from 'next/server';
import { getAccessToken, getSession } from '@/lib/auth0';

export async function GET() {
  const session = await getSession();
  let tokenPresent = false;
  let tokenError: string | undefined;
  let tokenAud: string | string[] | null = null;
  try {
    const { token: accessToken } = await getAccessToken();
    tokenPresent = !!accessToken;
    if (accessToken) {
      const [, payload] = accessToken.split('.');
      if (payload) {
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
        tokenAud = decoded?.aud ?? null;
      }
    }
  } catch (e: any) {
    tokenError = e?.code || e?.message || 'unknown_error';
  }
  return NextResponse.json({
    env: {
      audience: process.env.AUTH0_AUDIENCE || null,
      scope: process.env.AUTH0_SCOPE || null,
      baseUrl: process.env.AUTH0_BASE_URL || null,
      issuer: process.env.AUTH0_ISSUER_BASE_URL || null,
      clientId: process.env.AUTH0_CLIENT_ID ? 'set' : 'unset',
    },
    session: {
      present: !!session,
      sub: session?.user?.sub || null,
      email: session?.user?.email || null,
    },
    token: {
      present: tokenPresent,
  aud: tokenAud,
      error: tokenError || null,
    },
  });
}

