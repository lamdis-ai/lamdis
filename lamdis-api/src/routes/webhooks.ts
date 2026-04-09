import type { FastifyPluginAsync } from 'fastify';
import Stripe from 'stripe';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db.js';
import { organizations, subscriptions } from '@lamdis/db/schema';
import { env } from '../lib/env.js';
import { isStripeEnabled } from '../lib/deploymentMode.js';

// Stripe client is only created when entitlements mode is 'stripe'.
const stripe: Stripe | null = isStripeEnabled() ? new Stripe(env.STRIPE_SECRET!) : null;

const webhooks: FastifyPluginAsync = async (app) => {
  // In non-Stripe modes, webhook routes return 404
  if (!stripe) {
    app.post('/webhooks/stripe', async (_req, reply) => {
      return reply.code(404).send({ error: 'billing_not_available' });
    });
    return;
  }

  // Ensure raw body parsing enabled via fastify-raw-body (configured globally off, so enable per route)
  app.post('/webhooks/stripe', { config: { rawBody: true } }, async (req, reply) => {
    const sig = req.headers['stripe-signature'];
    if (!sig || !env.STRIPE_WEBHOOK_SECRET) return reply.code(400).send({ error: 'Missing signature' });
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent((req as any).rawBody, sig as string, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      return reply.code(400).send({ error: 'Invalid signature' });
    }
    const log = app.log.child({ scope: 'webhook', eventId: event.id, type: event.type });
    log.info({ received: true }, 'stripe webhook received');
    await handleStripeEvent(event, log);
    return { received: true };
  });
};

export default webhooks;

async function handleStripeEvent(event: Stripe.Event, log: any) {
  try {
    switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as Stripe.Checkout.Session;
      const customerId = s.customer as string;
      const subId = s.subscription as string | undefined;
      const plan = (s as any)?.line_items?.data?.[0]?.price?.nickname || (s as any)?.metadata?.plan || undefined;
      log.info({ customerId, subId, clientReferenceId: s.client_reference_id, planRaw: plan }, 'checkout.session.completed parsed');
      if (s.client_reference_id) {
        const orgId = s.client_reference_id;
        const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
        if (org) {
          const beforePlan = org.currentPlan;
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
          // Persist org linkage on the Stripe Customer for future events that may lack metadata
          try {
            const planStr = resolvedPlan ? String(resolvedPlan) : undefined;
            await stripe!.customers.update(customerId, { metadata: { orgId, ...(planStr ? { plan: planStr } : {}) } });
          } catch (e: any) {
            log.warn({ customerId, err: e?.message }, 'failed to write customer.metadata');
          }
          log.info({ orgId, beforePlan, afterPlan: resolvedPlan, status: 'active' }, 'org updated from checkout');
        } else {
          log.warn({ orgId }, 'org not found for checkout session');
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
      // Determine plan and org linkage
      const planMeta = (sub.metadata?.plan as string) || price?.nickname || (price?.id ?? undefined);
      const plan = planMeta ? planToKey(planMeta) : undefined;
      const orgIdMeta = sub.metadata?.orgId as string | undefined;
      // Prefer direct orgId metadata, else fall back to customer lookup
      let org: typeof organizations.$inferSelect | null = null;
      if (orgIdMeta) {
        const [found] = await db.select().from(organizations).where(eq(organizations.id, orgIdMeta)).limit(1);
        org = found ?? null;
      }
      if (!org) {
        const [found] = await db.select().from(organizations).where(eq(organizations.stripeCustomerId, customerId)).limit(1);
        org = found ?? null;
      }
      log.info({ subId: sub.id, customerId, orgIdMeta, hasPrice: !!price, priceNickname: price?.nickname, priceId: price?.id, planMeta, planResolved: plan, status }, 'subscription event parsed');
      // If no org found and no orgId meta, try to read from Stripe Customer metadata
      if (!org && !orgIdMeta) {
        try {
          const cust = await stripe!.customers.retrieve(customerId as string);
          const cm = (cust as any)?.metadata;
          const orgIdFromCustomer = cm?.orgId as string | undefined;
          if (orgIdFromCustomer) {
            const [found] = await db.select().from(organizations).where(eq(organizations.id, orgIdFromCustomer)).limit(1);
            org = found ?? null;
            log.info({ customerId, orgIdFromCustomer }, 'resolved org via customer.metadata.orgId');
          }
        } catch (e: any) {
          log.warn({ customerId, err: e?.message }, 'failed to retrieve customer for metadata');
        }
      }
      if (!org && process.env.LAMDIS_DEV_FEATURES === '1') {
        const [found] = await db.select().from(organizations).orderBy(desc(organizations.createdAt)).limit(1);
        org = found ?? null;
        log.warn({ customerId, orgIdMeta, fallback: 'dev-recent-org', chosenOrgId: org?.id }, 'no org matched; using dev fallback');
      }
      if (org) {
        const beforePlan = org.currentPlan;
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
        // Ensure future events can resolve org without dev fallbacks by persisting org linkage on the Stripe Customer
        try {
          const resolvedPlan = plan || org.currentPlan;
          const planStr = resolvedPlan ? String(resolvedPlan) : undefined;
          await stripe!.customers.update(customerId, { metadata: { orgId: String(org.id), ...(planStr ? { plan: planStr } : {}) } });
        } catch (e: any) {
          log.warn({ customerId, err: e?.message }, 'failed to write customer.metadata');
        }
        log.info({ orgId: org.id, beforePlan, afterPlan: plan || org.currentPlan, status: newStatus }, 'org updated from subscription event');
      } else {
        log.warn({ customerId, orgIdMeta }, 'no org matched for subscription event');
      }
      break;
    }
  }
    log.info({ type: event.type }, 'stripe webhook processed');
  } catch (err: any) {
    log.error({ err: err?.message || String(err) }, 'stripe webhook processing error');
    throw err;
  }
}

function mapStatus(s: string) {
  if (s === 'active' || s === 'trialing' || s === 'past_due' || s === 'canceled') return s;
  return 'active';
}

function planToKey(nickname: string): any {
  const n = (nickname || '').toLowerCase();
  if (n.includes('enterprise')) return 'enterprise';
  if (n.includes('success')) return 'success';
  if (n.includes('insights')) return 'insights';
  if (n.includes('pro')) return 'pro';
  return undefined;
}
