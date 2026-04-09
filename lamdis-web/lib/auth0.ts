/**
 * Auth0 client — completely stubbed when LAMDIS_AUTH_DISABLED=true.
 * Uses opaque require to prevent Turbopack from analyzing the Auth0 SDK.
 */

const AUTH_DISABLED = process.env.LAMDIS_AUTH_DISABLED === 'true';

const MOCK_SESSION = {
  user: { sub: 'anonymous', email: 'admin@localhost', name: 'Local Dev User', picture: '' },
  accessToken: 'local-dev-token',
};

// Opaque require that Turbopack cannot statically analyze
// eslint-disable-next-line no-eval
const opaqueRequire = typeof globalThis !== 'undefined' ? eval('require') : require;

let _client: any = null;

function getClient() {
  if (AUTH_DISABLED) return null;
  if (!_client) {
    const pkg = '@auth0/nextjs-auth0/server';
    const { Auth0Client } = opaqueRequire(pkg);
    _client = new Auth0Client({
      appBaseUrl: process.env.AUTH0_BASE_URL,
      domain: process.env.AUTH0_DOMAIN || process.env.AUTH0_ISSUER_BASE_URL?.replace('https://', ''),
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      secret: process.env.AUTH0_SECRET,
      authorizationParameters: {
        audience: process.env.AUTH0_AUDIENCE,
        scope: process.env.AUTH0_SCOPE || 'openid profile email',
      },
      routes: { login: '/api/auth/login', logout: '/api/auth/logout', callback: '/api/auth/callback' },
      transactionCookie: { sameSite: 'none' },
    });
  }
  return _client;
}

export async function getSession(req?: any): Promise<any> {
  if (AUTH_DISABLED) return MOCK_SESSION;
  const c = getClient();
  return req ? c.getSession(req) : c.getSession();
}

export async function getAccessToken(req?: any): Promise<any> {
  if (AUTH_DISABLED) return { token: 'local-dev-token' };
  const c = getClient();
  return req ? c.getAccessToken(req) : c.getAccessToken();
}

const noopHandler = async () => new Response('Auth disabled', { status: 200 });

export const auth0 = {
  getSession,
  getAccessToken,
  handleCallback: AUTH_DISABLED ? noopHandler : async (req: any) => getClient().handleCallback(req),
  middleware: AUTH_DISABLED ? noopHandler : async (req: any) => getClient().middleware(req),
  handlers: {
    GET: AUTH_DISABLED ? noopHandler : async (req: any) => getClient().handlers.GET(req),
    POST: AUTH_DISABLED ? noopHandler : async (req: any) => getClient().handlers.POST(req),
  },
};
