import type { FastifyPluginAsync } from 'fastify';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { organizations, subscriptions } from '@lamdis/db/schema';
import { env } from '../lib/env.js';
import { getEntitlementAdapter } from '../lib/entitlements/index.js';
import { isStripeEnabled } from '../lib/deploymentMode.js';

/**
 * Internal service-to-service API routes.
 * Protected by LAMDIS_API_TOKEN (same as lamdis-runs uses).
 * These routes are auth-bypassed in the auth plugin.
 */
const routes: FastifyPluginAsync = async (app) => {
  /** Verify the service-to-service API token */
  app.addHook('onRequest', async (req, reply) => {
    const token = req.headers['x-api-token'];
    const expected = env.LAMDIS_ADMIN_TOKEN || (env as any).LAMDIS_API_TOKEN;

    if (!expected) {
      // No token configured — allow in development, block in production
      if (env.NODE_ENV === 'production') {
        return reply.code(500).send({ error: 'Internal API token not configured' });
      }
      return;
    }

    if (token !== expected) {
      return reply.code(401).send({ error: 'Invalid API token' });
    }
  });

  /**
   * POST /internal/entitlements/check
   *
   * Body: { orgId: string, feature?: string, limitType?: 'runs' | 'users' | 'conversations' }
   * Response: { allowed: boolean, reason?, limit?, currentUsage?, warning? }
   *
   * Used by lamdis-runs to verify entitlements before executing a run.
   */
  app.post('/entitlements/check', async (req, reply) => {
    const { orgId, feature, limitType } = req.body as any;

    if (!orgId) {
      return reply.code(400).send({ error: 'orgId is required' });
    }

    const adapter = getEntitlementAdapter();

    if (feature) {
      return adapter.checkFeature(orgId, feature);
    }

    if (limitType) {
      return adapter.checkLimit(orgId, limitType);
    }

    return reply.code(400).send({ error: 'Either feature or limitType is required' });
  });

  /**
   * GET /internal/entitlements/status?orgId=...
   *
   * Returns full entitlement status for an org (tier, limits, usage, warnings).
   */
  app.get('/entitlements/status', async (req, reply) => {
    const { orgId } = req.query as any;

    if (!orgId) {
      return reply.code(400).send({ error: 'orgId query parameter is required' });
    }

    const adapter = getEntitlementAdapter();
    return adapter.getStatus(orgId);
  });

  /**
   * POST /internal/runs/completed
   *
   * Body: { orgId: string, runId: string, quantity?: number }
   *
   * Called by lamdis-runs when a run finishes. Reports usage to Stripe
   * for metered billing (cloud V3 plans only). No-op for self-hosted or
   * non-metered plans.
   */
  app.post('/runs/completed', async (req, reply) => {
    const { orgId, runId, quantity } = req.body as any;
    if (!orgId) return reply.code(400).send({ error: 'orgId is required' });

    // Only report to Stripe in cloud mode
    if (!isStripeEnabled() || !env.STRIPE_SECRET) {
      return { reported: false, reason: 'not_stripe_mode' };
    }

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Organization not found' });

    // Only report for V3 metered plans
    const plan = (org as any).currentPlan || '';
    if (plan !== 'cloud_v3') {
      return { reported: false, reason: 'not_metered_plan', plan };
    }

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).limit(1);
    if (!sub?.stripeSubId) {
      return { reported: false, reason: 'no_subscription' };
    }

    try {
      const stripe = new Stripe(env.STRIPE_SECRET);
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubId);
      const meteredItem = stripeSub.items.data.find(item => item.price.recurring?.usage_type === 'metered');

      if (!meteredItem) {
        return { reported: false, reason: 'no_metered_item' };
      }

      await stripe.subscriptionItems.createUsageRecord(meteredItem.id, {
        quantity: quantity || 1,
        timestamp: Math.floor(Date.now() / 1000),
        action: 'increment',
      });

      app.log.info({ orgId, runId, quantity: quantity || 1 }, 'stripe usage reported');
      return { reported: true, quantity: quantity || 1 };
    } catch (err: any) {
      app.log.error({ orgId, runId, error: err.message }, 'stripe usage report failed');
      return { reported: false, reason: 'stripe_error', error: err.message };
    }
  });
};

export default routes;
