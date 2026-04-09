import type { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db.js';
import { organizations, oauthStates, userCredentials, manifestVersions } from '@lamdis/db/schema';
import { encrypt } from '../lib/crypto.js';

function base64url(buf: Buffer) { return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }

const routes: FastifyPluginAsync = async (app) => {
  // List configured OAuth providers
  app.get('/orgs/:id/oauth/providers', async (req, reply) => {
    const { id } = req.params as any;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    const userSub = (req as any).user?.sub;
    const cfgs = (org.integrations as any)?.oauthProviders || {};
    let connected: Record<string, boolean> = {};
    try {
      if (userSub) {
        const creds = await db.select().from(userCredentials).where(and(eq(userCredentials.orgId, id), eq(userCredentials.userSub, userSub)));
        for (const c of creds) connected[c.provider] = true;
      }
    } catch {}
    const providers = Object.keys(cfgs).map((key) => {
      const cfg = cfgs[key] || {};
      const missing: string[] = [];
      if (!cfg.authorize_url) missing.push('authorize_url');
      if (!cfg.token_url) missing.push('token_url');
      if (!cfg.client_id) missing.push('client_id');
      return {
        key,
        connected: !!connected[key],
        scopes: cfg.scopes,
        status: { complete: missing.length === 0, missing }
      };
    });
    return { providers };
  });

  // Upsert an OAuth provider config
  app.post('/orgs/:id/oauth/providers', async (req, reply) => {
    const { id } = req.params as any;
    const { provider, authorize_url, token_url, client_id, client_secret, scopes, extra_params } = (req.body || {}) as any;
    if (!provider || !authorize_url || !token_url || !client_id) return reply.code(400).send({ error: 'Missing fields' });
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    const integrations = (org.integrations || {}) as any;
    const oauthProviders = integrations.oauthProviders || {};
    oauthProviders[provider] = { authorize_url, token_url, client_id, client_secret_enc: client_secret ? encrypt({ client_secret }) : undefined, scopes, extra_params };
    integrations.oauthProviders = oauthProviders;
    await db.update(organizations).set({ integrations, updatedAt: new Date() }).where(eq(organizations.id, id));
    return { ok: true };
  });

  // Get a single OAuth provider config (sans client_secret)
  app.get('/orgs/:id/oauth/providers/:provider', async (req, reply) => {
    const { id, provider } = req.params as any;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    const cfg = (org.integrations as any)?.oauthProviders?.[provider];
    if (!cfg) return reply.code(404).send({ error: 'Provider not found' });
    const { authorize_url, token_url, client_id, scopes, extra_params } = cfg || {};
    return { provider, authorize_url, token_url, client_id, scopes, extra_params };
  });

  // Delete an OAuth provider config
  app.delete('/orgs/:id/oauth/providers/:provider', async (req, reply) => {
    const { id, provider } = req.params as any;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    const integrations = (org.integrations || {}) as any;
    const oauthProviders = integrations.oauthProviders || {};
    if (!oauthProviders[provider]) return reply.code(404).send({ error: 'Provider not found' });
    delete oauthProviders[provider];
    integrations.oauthProviders = oauthProviders;
    await db.update(organizations).set({ integrations, updatedAt: new Date() }).where(eq(organizations.id, id));
    return { ok: true };
  });

  // Begin OAuth (Authorization Code + PKCE)
  app.get('/orgs/:id/oauth/:provider/start', async (req, reply) => {
    const { id, provider } = req.params as any;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    const cfg = (org.integrations as any)?.oauthProviders?.[provider];
    if (!cfg) return reply.code(404).send({ error: 'Provider not configured' });
    let userSub = (req as any).user?.sub as string | undefined;
    if (!userSub) {
      const allowPublic = process.env.PUBLIC_OAUTH_START === 'true' || process.env.NODE_ENV !== 'production';
      if (!allowPublic) return reply.code(401).send({ error: 'Unauthorized' });
      // Use an org-scoped pseudo user for public/dev flows so Test MCP can work locally
      userSub = `public:${id}`;
    }
    const codeVerifier = base64url(crypto.randomBytes(32));
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
    const state = base64url(crypto.randomBytes(24));
    const webBase = process.env.WEB_BASE_URL || 'http://localhost:3000';
    const apiBase = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const redirectUri = `${apiBase}/oauth/callback`;

    const exp = new Date(Date.now() + 10 * 60 * 1000);
    await db.insert(oauthStates).values({ orgId: id, userSub, provider, state, codeVerifier, redirectTo: `${webBase}/dashboard/test?connected=${provider}`, expiresAt: exp });

    // Determine scopes: prefer union from latest compiled manifest
    let scopeStr = cfg.scopes || 'openid profile';
    try {
      const [latest] = await db.select().from(manifestVersions).where(eq(manifestVersions.orgId, id)).orderBy(desc(manifestVersions.createdAt)).limit(1);
      const union = (latest?.providers as any)?.[provider]?.scopes;
      if (Array.isArray(union) && union.length) scopeStr = union.join(' ');
    } catch {}

    const url = new URL(cfg.authorize_url);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', cfg.client_id);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', scopeStr);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    // Provider-specific extra params (e.g., Auth0 audience)
    try {
      const extras = cfg.extra_params || {};
      for (const [k,v] of Object.entries(extras)) {
        if (v != null) url.searchParams.set(k, String(v));
      }
    } catch {}

    return reply.redirect(url.toString());
  });

  // OAuth callback: exchange code for tokens and store per-user credential
  app.get('/oauth/callback', async (req, reply) => {
    const { code, state } = (req.query || {}) as any;
    if (!code || !state) return reply.code(400).send({ error: 'Invalid callback' });
    const [st] = await db.select().from(oauthStates).where(eq(oauthStates.state, state)).limit(1);
    if (!st || st.expiresAt < new Date()) return reply.code(400).send({ error: 'State expired' });
    const [org] = await db.select().from(organizations).where(eq(organizations.id, st.orgId)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    const cfg = (org.integrations as any)?.oauthProviders?.[st.provider];
    if (!cfg) return reply.code(404).send({ error: 'Provider not configured' });
    const apiBase = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const redirectUri = `${apiBase}/oauth/callback`;

    // Exchange code
    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set('code', String(code));
    params.set('redirect_uri', redirectUri);
    params.set('client_id', cfg.client_id);
    // Client secret if available
    try {
      if (cfg.client_secret_enc) {
        const { decrypt } = await import('../lib/crypto.js');
        const d = decrypt(cfg.client_secret_enc);
        if (d?.client_secret) params.set('client_secret', d.client_secret);
      }
    } catch {}

    // PKCE
    params.set('code_verifier', st.codeVerifier);

    const tokenResp = await fetch(cfg.token_url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
    const tokenText = await tokenResp.text();
    if (!tokenResp.ok) return reply.code(400).send({ error: 'Token exchange failed', details: tokenText });
    let tokenJson: any = {};
    try { tokenJson = JSON.parse(tokenText); } catch { tokenJson = { raw: tokenText }; }

    const access_token = tokenJson.access_token;
    const refresh_token = tokenJson.refresh_token;
    const expires_in = Number(tokenJson.expires_in || 3600);
    const expires_at = new Date(Date.now() + expires_in * 1000);

    const enc = encrypt({ access_token, refresh_token, expires_at: expires_at.toISOString() });
    // Upsert: insert or update on conflict (orgId, userSub, provider)
    await db.insert(userCredentials)
      .values({ orgId: st.orgId, userSub: st.userSub, provider: st.provider, enc, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [userCredentials.orgId, userCredentials.userSub, userCredentials.provider],
        set: { enc, updatedAt: new Date() },
      });
    await db.delete(oauthStates).where(eq(oauthStates.state, state));

    const dest = st.redirectTo || (process.env.WEB_BASE_URL || 'http://localhost:3000') + '/dashboard/test';
    return reply.redirect(dest);
  });

  // Disconnect: delete stored per-user credentials for a provider
  app.delete('/orgs/:id/oauth/:provider/disconnect', async (req, reply) => {
    const { id, provider } = req.params as any;
    const userSub = (req as any).user?.sub;
    if (!userSub) return reply.code(401).send({ error: 'Unauthorized' });
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    await db.delete(userCredentials).where(and(eq(userCredentials.orgId, id), eq(userCredentials.userSub, userSub), eq(userCredentials.provider, provider)));

    const instanceId = (req as any).lamdisInstanceId;
    if (instanceId) {
      import('../lib/lamdis.js').then(({ getLamdis }) => getLamdis()).then(lamdis => {
        if (lamdis) lamdis.resumeWorkflow(instanceId, 'account-closure-execution', 'lamdis-api')
          .emit('integrations.disabled', { orgId: id, provider });
      }).catch(() => {});
    }

    return { ok: true };
  });

  // Public helper: revoke (alias to disconnect when authenticated; otherwise instructions)
  app.post('/orgs/:id/oauth/:provider/revoke', async (req, reply) => {
    const { id, provider } = req.params as any;
    const userSub = (req as any).user?.sub;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Org not found' });
    const mode = (org.manifest as any)?.providers?.[provider]?.mode || 'agent';
    if (userSub) {
      await db.delete(userCredentials).where(and(eq(userCredentials.orgId, id), eq(userCredentials.userSub, userSub), eq(userCredentials.provider, provider)));
      return { ok: true };
    }
    // If no auth, try revoking public pseudo-user in dev
    if (process.env.PUBLIC_OAUTH_START === 'true' || process.env.NODE_ENV !== 'production') {
      await db.delete(userCredentials).where(and(eq(userCredentials.orgId, id), eq(userCredentials.userSub, `public:${id}`), eq(userCredentials.provider, provider)));
      return { ok: true, note: 'revoked public credential' };
    }
    // Agent-managed: provide human instructions
    return { ok: false, instructions: `Open your ${provider} account settings and revoke access for this app.` , mode };
  });
};

export default routes;
