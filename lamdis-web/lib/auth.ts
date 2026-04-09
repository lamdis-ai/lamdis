const AUTH_DISABLED = process.env.LAMDIS_AUTH_DISABLED === 'true';

const mockAuth0 = {
  getSession: async () => ({
    user: { sub: 'anonymous', email: 'admin@localhost', name: 'Local Dev User' },
    accessToken: 'local-dev-token',
  }),
  getAccessToken: async () => ({ token: 'local-dev-token' }),
};

let _realAuth0: any = null;
function getRealAuth0() {
  if (!_realAuth0) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _realAuth0 = require('@lamdis-ai/shared-web/src/lib/auth');
  }
  return _realAuth0;
}

export const auth0: any = AUTH_DISABLED
  ? mockAuth0
  : new Proxy({}, { get: (_, prop) => getRealAuth0().auth0[prop] });

export async function getBearerSafe(): Promise<string> {
  if (AUTH_DISABLED) return 'Bearer local-dev-token';
  return getRealAuth0().getBearerSafe();
}

export async function getSession() {
  return auth0.getSession();
}
