import type { FastifyPluginAsync } from 'fastify';
import { createAuthStrategy } from '../lib/auth/index.js';
import { validateApiKey } from '../routes/api-keys.js';

const strategy = createAuthStrategy();

export const authPlugin: FastifyPluginAsync = async (app) => {
  await strategy.initialize();

  app.decorateRequest('user', null as any);

  app.addHook('onRequest', async (req, reply) => {
  const path = (req.raw.url || '').split('?')[0];
  const debugId = (req.headers as any)['x-debug-id'];
    const log = req.log;
    const startAt = Date.now();
    if (
      path.startsWith('/health') ||
      path.startsWith('/bridge') ||
      path.startsWith('/billing/webhook') ||
      path.startsWith('/webhooks/stripe') ||
      // Inbound webhook from external providers (Twilio SMS, etc.) — auth via signature verification
      /^\/orgs\/[^/]+\/channels\/[^/]+\/inbound$/.test(path) ||
      // Browser view WebSocket — auth via single-use viewer token in query string
      path === '/browser-view/ws' ||
      path.startsWith('/public') ||
      path.startsWith('/v1/marketing') ||
      path.startsWith('/oauth/callback') ||
      path.startsWith('/analytics/ingest') ||
      path.startsWith('/v1/events') ||
      path.startsWith('/v1/mobile/auth/refresh') ||
      path.startsWith('/v1/mobile/status') ||
      // Self-hosted setup routes (protected by admin token internally)
      path.startsWith('/setup') ||
      // Internal service-to-service routes (protected by API token)
      path.startsWith('/internal') ||
      // Public join code lookup
      /^\/auth0-orgs\/join\/[^/]+$/.test(path) ||
      // Allow trusted/local manual run trigger without org context
      /^\/suites\/[^/]+\/run-now$/.test(path)
    ) {
      log.info({ path, method: req.method, bypass: true, debugId }, 'auth_bypass');
      return;
    }
    // Allow public OAuth start/status/revoke proxies without bearer auth (handled by target routes)
    if (/^\/orgs\/[^/]+\/oauth\/(?:[^/]+)\/(start|status|revoke)/.test(path)) {
      log.info({ path, method: req.method, bypass: true, reason: 'oauth_proxy', debugId }, 'auth_bypass');
      return;
    }
    const authHeader = req.headers.authorization;

    // Try API key auth via x-lamdis-api-key header when no Bearer token
    if (!authHeader?.startsWith('Bearer ')) {
      const apiKey = req.headers['x-lamdis-api-key'] as string | undefined;
      if (apiKey) {
        const result = await validateApiKey(apiKey);
        if (result.valid) {
          (req as any).apiKeyAuth = {
            orgId: result.orgId!,
            scopes: result.scopes || [],
          };
          log.info({ path, method: req.method, authType: 'api_key', durMs: Date.now() - startAt, debugId }, 'auth_ok');
          return;
        }
        log.warn({ path, method: req.method, err: result.error, debugId }, 'auth_invalid_api_key');
        return reply.code(401).send({ error: result.error || 'Invalid API key' });
      }

      log.warn({ path, method: req.method, hasAuth: !!authHeader, debugId }, 'auth_missing_token');
      return reply.code(401).send({ error: 'Missing token' });
    }
    const token = authHeader.substring(7);

    try {
      const user = await strategy.verify(token);
      (req as any).user = user.raw;
      // Attach the normalised user for downstream consumers that want it
      (req as any).authenticatedUser = user;
      log.info({ path, method: req.method, verified: true, strategy: strategy.name, durMs: Date.now() - startAt, debugId }, 'auth_ok');
    } catch (e) {
      log.warn({ path, method: req.method, strategy: strategy.name, err: (e as any)?.message, debugId }, 'auth_invalid_token');
      return reply.code(401).send({ error: 'Invalid token' });
    }
  });
};
