import type { FastifyPluginAsync } from 'fastify';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { organizations, subscriptions } from '@lamdis/db/schema';
import { env } from '../lib/env.js';
import { isStripeEnabled } from '../lib/deploymentMode.js';

// Stripe client is only created when entitlements mode is 'stripe'.
// In self-hosted / open modes, billing routes return 404.
const stripe: Stripe | null = isStripeEnabled() ? new Stripe(env.STRIPE_SECRET!) : null;

// V3 Stripe price IDs — update after running scripts/setup-v3-pricing.mjs
const V3_PRICE_IDS = {
  platformMonthly: (env as any).STRIPE_V3_PLATFORM_MONTHLY || 'price_1T7ozgLe8gsAwSLB4XFXHYPG',
  platformAnnual: (env as any).STRIPE_V3_PLATFORM_ANNUAL || 'price_1T7ozhLe8gsAwSLBzG0VnzHh',
  runsMetered: (env as any).STRIPE_V3_RUNS_METERED || 'price_1T7ozhLe8gsAwSLB8bmVf5Px',
  retention1year: (env as any).STRIPE_V3_RETENTION_1YEAR || 'price_1T7oziLe8gsAwSLB6WjBuSYF',
  retention2year: (env as any).STRIPE_V3_RETENTION_2YEAR || 'price_1T7oziLe8gsAwSLBFfHez9BR',
  retention5year: (env as any).STRIPE_V3_RETENTION_5YEAR || 'price_1T7oziLe8gsAwSLBte6m6VPz',
};

// Plan to Stripe price ID mapping - V2 Pricing (February 2026) - kept for legacy
const PLAN_PRICE_MAP: Record<string, string | undefined> = {
  // V2 Runs plans
  'runs_free': undefined,
  'runs_pro': (env as any).STRIPE_PRICE_RUNS_PRO || 'price_runs_pro_placeholder',
  'runs_team': (env as any).STRIPE_PRICE_RUNS_TEAM || 'price_runs_team_placeholder',
  'runs_business': (env as any).STRIPE_PRICE_RUNS_BUSINESS || 'price_runs_business_placeholder',
  'runs_enterprise': undefined,
  // Legacy plans (for existing customers)
  'pro': 'price_1SwZrfLe8gsAwSLBL5CbqdWD',
  'insights': (env as any).STRIPE_PRICE_INSIGHTS,
  'growth': (env as any).STRIPE_PRICE_GROWTH,
  'scale': (env as any).STRIPE_PRICE_SCALE,
  'success': (env as any).STRIPE_PRICE_SCALE,
  'starter': undefined,
  'enterprise': undefined,
};

// V2 Plan limits for usage calculations
const PLAN_RUN_LIMITS: Record<string, number> = {
  // V2 Runs plans
  'runs_free': 200,
  'runs_pro': 5000,
  'runs_team': 25000,
  'runs_business': 150000,
  'runs_enterprise': 500000,

  // Legacy Runs plans
  'starter': 100,
  'free_trial': 200,
  'pro': 2000,
  'enterprise': Infinity,
  'insights': 500,
  'growth': 2000,
  'scale': 10000,
  'team': 5000,
  'business': 20000,
  'build': 100,
};

const routes: FastifyPluginAsync = async (app) => {
  // In non-Stripe modes, all billing routes return 404
  if (!stripe) {
    app.addHook('onRequest', async (_req, reply) => {
      return reply.code(404).send({
        error: 'billing_not_available',
        message: 'Billing is managed via license file in self-hosted mode',
      });
    });
    return;
  }

  // Start free trial (no credit card required)
  app.post('/free-trial', async (req, reply) => {
    const { orgId, planKey } = req.body as any;

    if (!orgId) {
      return reply.code(400).send({ error: 'Missing orgId' });
    }

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) {
      return reply.code(404).send({ error: 'Organization not found' });
    }

    const now = new Date();
    const trialDays = 14;
    const trialEnds = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    // Runs free trial (default)
    // Check if already on a paid plan
    if (org.stripeCustomerId && org.subscriptionStatus === 'active') {
      return reply.code(400).send({ error: 'Organization already has an active subscription' });
    }

    // Check if free trial already used
    if (org.freeTrialActivated) {
      return reply.code(400).send({ error: 'Free trial already used. Please upgrade to a paid plan.' });
    }

    // Determine trial plan based on planKey (defaults to Pro trial)
    const trialPlan = planKey || 'pro';

    await db.update(organizations).set({
      freeTrialStartedAt: now,
      freeTrialEndsAt: trialEnds,
      freeTrialActivated: true,
      currentPlan: trialPlan,
      subscriptionStatus: 'trialing',
      updatedAt: new Date(),
    }).where(eq(organizations.id, orgId));

    app.log.info({ route: 'billing/free-trial', orgId, trialPlan, trialEnds }, 'runs free trial activated');

    return {
      success: true,
      plan: trialPlan,
      product: 'runs',
      trialStarted: now.toISOString(),
      trialEnds: trialEnds.toISOString(),
      message: `Your ${trialDays}-day free trial of ${trialPlan.toUpperCase()} has started. No credit card required.`
    };
  });

  app.post('/checkout', async (req, reply) => {
    const { priceId, customerEmail, orgId, planKey } = req.body as any;

    // Resolve priceId from planKey if priceId not explicitly provided
    let resolvedPriceId: string | undefined = priceId;
    if (!resolvedPriceId && planKey) {
      resolvedPriceId = PLAN_PRICE_MAP[planKey];

      // Fall back to env vars for additional legacy support
      if (!resolvedPriceId) {
        switch (planKey) {
          case 'starter':
            return reply.code(400).send({ error: 'Starter plan is free. No checkout needed.' });
          case 'enterprise':
            return reply.code(400).send({ error: 'Enterprise plan requires custom pricing. Contact sales.' });
        }
      }
    }

    if (!resolvedPriceId) {
      return reply.code(400).send({ error: 'Missing priceId (server has no Stripe price configured for this plan)' });
    }

    let customer: string | undefined;
    if (orgId) {
      const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
      customer = org?.stripeCustomerId || undefined;
    }

    const webBase = process.env.WEB_BASE_URL || 'http://localhost:3000';
    app.log.info({ route: 'billing/checkout', orgId, planKey, priceId, resolvedPriceId, hasCustomer: !!customer }, 'creating checkout session');
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      customer: customer,
      customer_email: customer ? undefined : customerEmail,
      client_reference_id: orgId,
      metadata: planKey ? { plan: planKey } : undefined,
      // Carry org linkage and plan into the created Subscription for webhook correlation
      subscription_data: {
        metadata: {
          ...(orgId ? { orgId } : {}),
          ...(planKey ? { plan: planKey } : {})
        }
      },
      success_url: `${webBase.replace(/\/$/, '')}/dashboard/billing?checkout=success`,
      cancel_url: `${webBase.replace(/\/$/, '')}/dashboard/billing?checkout=cancel`,
    });
    app.log.info({ route: 'billing/checkout', sessionId: session.id, url: session.url, orgId, planKey }, 'checkout session created');
    return { url: session.url };
  });

  app.post('/portal', async (req, reply) => {
    const { orgId, userEmail } = req.body as any;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Organization not found' });

    // If no Stripe customer exists, create one
    if (!org.stripeCustomerId) {
      try {
        const customer = await stripe.customers.create({
          name: org.name,
          email: userEmail || undefined,
          metadata: { orgId: org.id },
        });
        await db.update(organizations).set({
          stripeCustomerId: customer.id,
          updatedAt: new Date(),
        }).where(eq(organizations.id, orgId));
        app.log.info({ route: 'billing/portal', orgId, customerId: customer.id }, 'created new Stripe customer');
        // Use newly created customer id
        org.stripeCustomerId = customer.id;
      } catch (err: any) {
        app.log.error({ route: 'billing/portal', orgId, error: err.message }, 'failed to create Stripe customer');
        return reply.code(500).send({ error: 'Failed to create billing customer' });
      }
    }

    const webBase = process.env.WEB_BASE_URL || 'http://localhost:3000';
    app.log.info({ route: 'billing/portal', orgId, customerId: org.stripeCustomerId }, 'creating billing portal session');
    const portal = await stripe.billingPortal.sessions.create({ customer: org.stripeCustomerId, return_url: `${webBase.replace(/\/$/, '')}/dashboard/billing` });
    app.log.info({ route: 'billing/portal', url: portal.url, orgId }, 'billing portal session created');
    return { url: portal.url };
  });

  // Admin/self-service: reconcile plan/status from Stripe for an org
  app.post('/reconcile', async (req, reply) => {
    const { orgId } = req.body as any;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org || !org.stripeCustomerId) return reply.code(400).send({ error: 'Missing organization or customer' });
    app.log.info({ route: 'billing/reconcile', orgId, customerId: org.stripeCustomerId }, 'reconcile requested');
    const subs = await stripe.subscriptions.list({ customer: org.stripeCustomerId, status: 'all', limit: 10 });
    const sub = subs.data.find(s => s.status !== 'canceled') || subs.data[0];
    if (!sub) return reply.code(404).send({ error: 'No subscriptions found' });
    const price = sub.items.data[0]?.price;
    const planKey = planToKey((price?.nickname as string) || (price?.id as string) || (sub.metadata?.plan as string) || '');
    const newStatus = mapStatus(sub.status as any);
    await db.update(organizations).set({
      currentPlan: planKey,
      subscriptionStatus: newStatus,
      updatedAt: new Date(),
    }).where(eq(organizations.id, orgId));
    // Upsert subscription record
    const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).limit(1);
    if (existingSub) {
      await db.update(subscriptions).set({
        stripeSubId: sub.id,
        status: newStatus,
        currentPlan: planKey,
        currentPeriodEnd: new Date((sub.current_period_end || 0) * 1000),
        updatedAt: new Date(),
      }).where(eq(subscriptions.orgId, orgId));
    } else {
      await db.insert(subscriptions).values({
        orgId,
        stripeSubId: sub.id,
        status: newStatus,
        currentPlan: planKey,
        currentPeriodEnd: new Date((sub.current_period_end || 0) * 1000),
      });
    }
    app.log.info({ route: 'billing/reconcile', orgId, subId: sub.id, status: newStatus, plan: planKey, priceNickname: price?.nickname, priceId: price?.id, metaPlan: sub.metadata?.plan }, 'reconcile updated org');
    return { updated: true, plan: planKey, status: newStatus };
  });

  // Admin: manually set plan for an org (useful for enterprise or special cases)
  app.post('/admin/set-plan', async (req, reply) => {
    const { orgId, plan, status } = req.body as any;

    if (!orgId || !plan) {
      return reply.code(400).send({ error: 'Missing orgId or plan' });
    }

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) {
      return reply.code(404).send({ error: 'Organization not found' });
    }

    const newStatus = status || 'active';
    await db.update(organizations).set({
      currentPlan: plan,
      subscriptionStatus: newStatus,
      updatedAt: new Date(),
    }).where(eq(organizations.id, orgId));

    app.log.info({ route: 'billing/admin/set-plan', orgId, plan, status: newStatus }, 'plan manually set');
    return { success: true, plan, status: newStatus };
  });

  // ── V3 Checkout: multi-item subscription (platform + metered runs + optional retention) ──
  app.post('/v3/checkout', async (req, reply) => {
    const { orgId, customerEmail, billing, retentionAddon } = req.body as any;
    // billing: 'monthly' | 'annual'

    if (!orgId) {
      return reply.code(400).send({ error: 'Missing orgId' });
    }

    let customer: string | undefined;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    customer = org?.stripeCustomerId || undefined;

    const platformPriceId = billing === 'annual' ? V3_PRICE_IDS.platformAnnual : V3_PRICE_IDS.platformMonthly;

    // Build line items: platform fee + metered runs + optional retention
    const lineItems: Array<{ price: string; quantity?: number }> = [
      { price: platformPriceId, quantity: 1 },
      { price: V3_PRICE_IDS.runsMetered }, // metered — no quantity
    ];

    // Add retention add-on if requested
    const retentionPriceMap: Record<string, string> = {
      '1year': V3_PRICE_IDS.retention1year,
      '2year': V3_PRICE_IDS.retention2year,
      '5year': V3_PRICE_IDS.retention5year,
    };
    if (retentionAddon && retentionPriceMap[retentionAddon]) {
      lineItems.push({ price: retentionPriceMap[retentionAddon], quantity: 1 });
    }

    const webBase = process.env.WEB_BASE_URL || 'http://localhost:3000';
    app.log.info({ route: 'billing/v3/checkout', orgId, billing, retentionAddon, items: lineItems.length }, 'creating V3 checkout');

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: lineItems,
      customer: customer,
      customer_email: customer ? undefined : customerEmail,
      client_reference_id: orgId,
      metadata: { plan: 'cloud_v3', pricing_version: 'v3' },
      subscription_data: {
        metadata: {
          orgId: orgId,
          plan: 'cloud_v3',
          pricing_version: 'v3',
          ...(retentionAddon ? { retention_addon: retentionAddon } : {}),
        },
      },
      success_url: `${webBase.replace(/\/$/, '')}/dashboard/billing?checkout=success`,
      cancel_url: `${webBase.replace(/\/$/, '')}/dashboard/billing?checkout=cancel`,
    });

    app.log.info({ route: 'billing/v3/checkout', sessionId: session.id, url: session.url }, 'V3 checkout created');
    return { url: session.url };
  });

  // ── V3 Community: activate free plan ──
  app.post('/v3/activate-community', async (req, reply) => {
    const { orgId } = req.body as any;
    if (!orgId) return reply.code(400).send({ error: 'Missing orgId' });

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return reply.code(404).send({ error: 'Organization not found' });

    await db.update(organizations).set({
      currentPlan: 'cloud_community',
      subscriptionStatus: 'free',
      updatedAt: new Date(),
    }).where(eq(organizations.id, orgId));

    app.log.info({ route: 'billing/v3/activate-community', orgId }, 'V3 community activated');
    return { success: true, plan: 'cloud_community' };
  });

  // ── V3 Usage record: report a single run to Stripe metered billing ──
  app.post('/v3/report-usage', async (req, reply) => {
    const { orgId, quantity } = req.body as any;
    if (!orgId) return reply.code(400).send({ error: 'Missing orgId' });

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).limit(1);
    if (!sub?.stripeSubId) return reply.code(400).send({ error: 'No active subscription' });

    // Find the metered subscription item
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubId);
    const meteredItem = stripeSub.items.data.find(item => {
      const price = item.price;
      return price.recurring?.usage_type === 'metered';
    });

    if (!meteredItem) return reply.code(400).send({ error: 'No metered item on subscription' });

    await stripe.subscriptionItems.createUsageRecord(meteredItem.id, {
      quantity: quantity || 1,
      timestamp: Math.floor(Date.now() / 1000),
      action: 'increment',
    });

    return { success: true, reported: quantity || 1 };
  });

  // Legacy path kept; new path /webhooks/stripe per spec
  app.post('/webhook', { config: { rawBody: true } }, async (req, reply) => {
    const sig = req.headers['stripe-signature'];
    if (!sig || !env.STRIPE_WEBHOOK_SECRET) return reply.code(400).send({ error: 'Missing signature' });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent((req as any).rawBody, sig as string, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return reply.code(400).send({ error: 'Invalid signature' });
    }

    app.log.info({ route: 'billing/legacy-webhook', type: event.type, id: event.id }, 'stripe webhook received');
    await handleStripeEvent(event);
    app.log.info({ route: 'billing/legacy-webhook', type: event.type, id: event.id }, 'stripe webhook processed');
    return { received: true };
  });

  app.post('/../webhooks/stripe', { config: { rawBody: true, url: '/webhooks/stripe' } } as any, async () => { /* handled above */ });
};

export default routes;

async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'customer.created': {
      const c = event.data.object as Stripe.Customer;
      // No orgId context here unless by metadata; ignore for now
      break;
    }
    case 'checkout.session.completed': {
      const s = event.data.object as Stripe.Checkout.Session;
      const customerId = s.customer as string;
      const subId = s.subscription as string | undefined;
      const plan = (s as any)?.line_items?.data?.[0]?.price?.nickname || (s as any)?.metadata?.plan || undefined;
      if (s.client_reference_id) {
        const orgId = s.client_reference_id;
        const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
        if (org) {
          const resolvedPlan = plan ? planToKey(plan) : org.currentPlan;
          await db.update(organizations).set({
            stripeCustomerId: customerId,
            currentPlan: resolvedPlan,
            subscriptionStatus: 'active',
            updatedAt: new Date(),
          }).where(eq(organizations.id, orgId));
          // Upsert subscription record
          const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).limit(1);
          if (existingSub) {
            await db.update(subscriptions).set({
              stripeCustomerId: customerId,
              stripeSubId: subId,
              status: 'active',
              currentPlan: resolvedPlan,
              updatedAt: new Date(),
            }).where(eq(subscriptions.orgId, orgId));
          } else {
            await db.insert(subscriptions).values({
              orgId,
              stripeCustomerId: customerId,
              stripeSubId: subId,
              status: 'active',
              currentPlan: resolvedPlan,
            });
          }
        }
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;
      const status = sub.status as any;
      const price = sub.items.data[0]?.price;
      const planMeta = (sub.metadata?.plan as string) || price?.nickname || (price?.id ?? undefined);
      const plan = planMeta ? planToKey(planMeta, sub.metadata as Record<string, string>) : undefined;
      const orgIdMeta = sub.metadata?.orgId as string | undefined;
      let org: typeof organizations.$inferSelect | null = null;
      if (orgIdMeta) {
        const [found] = await db.select().from(organizations).where(eq(organizations.id, orgIdMeta)).limit(1);
        org = found ?? null;
      }
      if (!org) {
        const [found] = await db.select().from(organizations).where(eq(organizations.stripeCustomerId, customerId)).limit(1);
        org = found ?? null;
      }
      if (org) {
        const newStatus = mapStatus(status);
        await db.update(organizations).set({
          stripeCustomerId: org.stripeCustomerId || customerId,
          subscriptionStatus: newStatus,
          ...(plan ? { currentPlan: plan } : {}),
          updatedAt: new Date(),
        }).where(eq(organizations.id, org.id));
        // Upsert subscription record
        const [existingSub] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, org.id)).limit(1);
        if (existingSub) {
          await db.update(subscriptions).set({
            stripeSubId: sub.id,
            status: newStatus,
            currentPlan: plan || existingSub.currentPlan,
            currentPeriodEnd: new Date((sub.current_period_end || 0) * 1000),
            updatedAt: new Date(),
          }).where(eq(subscriptions.orgId, org.id));
        } else {
          await db.insert(subscriptions).values({
            orgId: org.id,
            stripeSubId: sub.id,
            status: newStatus,
            currentPlan: plan,
            currentPeriodEnd: new Date((sub.current_period_end || 0) * 1000),
          });
        }
      }
      break;
    }
  }
}

function mapStatus(s: string) {
  if (s === 'active' || s === 'trialing' || s === 'past_due' || s === 'canceled') return s;
  return 'active';
}

function planToKey(nickname: string, metadata?: Record<string, string>): any {
  // V3: check metadata first
  if (metadata?.pricing_version === 'v3' || metadata?.plan?.startsWith('cloud_')) {
    return metadata?.plan || 'cloud_v3';
  }

  const n = (nickname || '').toLowerCase();

  // V3 nickname detection
  if (n.includes('lamdis cloud platform')) return 'cloud_v3';

  // Legacy price ID matches
  if (n.includes('price_1swzrfle8gsawslbl5cbqdwd')) return 'pro';
  // Legacy nicknames
  if (n.includes('pro')) return 'pro';
  if (n.includes('business')) return 'business';
  if (n.includes('enterprise')) return 'enterprise';
  if (n.includes('scale') || n.includes('success')) return 'scale';
  if (n.includes('growth')) return 'growth';
  if (n.includes('insights')) return 'insights';
  return 'starter';
}
