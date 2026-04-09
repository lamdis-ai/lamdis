import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { getEntitlementAdapter } from '../lib/entitlements/index.js';

/**
 * Fastify plugin that provides entitlement checking decorators.
 *
 * Usage in routes:
 *   app.get('/some-route', {
 *     preHandler: [app.requireFeature('sso')],
 *   }, handler);
 *
 *   app.post('/runs', {
 *     preHandler: [app.requireLimit('runs')],
 *   }, handler);
 */
export const entitlementPlugin: FastifyPluginAsync = async (app) => {
  /**
   * Returns a preHandler that checks whether a feature is entitled for the org.
   * The org ID is read from request params (orgId), query, or body.
   */
  app.decorate('requireFeature', function (feature: string) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      const orgId = resolveOrgId(request);
      if (!orgId) {
        return reply.code(400).send({ error: 'Missing orgId for entitlement check' });
      }

      const adapter = getEntitlementAdapter();
      const check = await adapter.checkFeature(orgId, feature);

      if (!check.allowed) {
        return reply.code(403).send({
          error: 'entitlement_exceeded',
          feature,
          reason: check.reason,
        });
      }
    };
  });

  /**
   * Returns a preHandler that checks usage limits for a given type.
   */
  app.decorate('requireLimit', function (limitType: 'runs' | 'users' | 'conversations') {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      const orgId = resolveOrgId(request);
      if (!orgId) {
        return reply.code(400).send({ error: 'Missing orgId for entitlement check' });
      }

      const adapter = getEntitlementAdapter();
      const check = await adapter.checkLimit(orgId, limitType);

      if (!check.allowed) {
        return reply.code(403).send({
          error: 'entitlement_exceeded',
          limitType,
          reason: check.reason,
          currentUsage: check.currentUsage,
          limit: check.limit,
        });
      }
    };
  });
};

/** Extract orgId from various request locations */
function resolveOrgId(request: FastifyRequest): string | undefined {
  const params = request.params as any;
  const query = request.query as any;
  const body = request.body as any;

  return params?.orgId || params?.id || query?.orgId || body?.orgId;
}
