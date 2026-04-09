import { eq } from 'drizzle-orm';
import { db } from '../../db.js';
import { organizations } from '@lamdis/db/schema';
import { getUsageForLimit, getMeteringSnapshot, getUnifiedRunCount } from '../../services/meteringService.js';
import type { EntitlementAdapter, EntitlementCheck, OrgEntitlementStatus } from './entitlementAdapter.js';

/** V3 unified run limits (test runs + conversations count as one metric) */
const V3_RUN_LIMITS: Record<string, number> = {
  cloud_community: 500,
  cloud_v3: Infinity,       // metered, no hard cap
  cloud_enterprise: Infinity, // committed volume
};

/** Legacy plan run limits */
const PLAN_RUN_LIMITS: Record<string, number> = {
  runs_free: 200,
  runs_pro: 5000,
  runs_team: 25000,
  runs_business: 150000,
  runs_enterprise: 500000,
  starter: 100,
  free_trial: 200,
  pro: 2000,
  enterprise: Infinity,
  insights: 500,
  growth: 2000,
  scale: 10000,
  team: 5000,
  business: 20000,
  build: 100,
};

function isV3Plan(plan: string): boolean {
  return plan.startsWith('cloud_') || plan.startsWith('selfhosted_');
}

/**
 * Stripe entitlement adapter — used in cloud mode.
 * Supports both V2 (separate runs/conversations) and V3 (unified runs) plans.
 */
export class StripeEntitlementAdapter implements EntitlementAdapter {
  readonly name = 'stripe';

  async checkFeature(orgId: string, feature: string): Promise<EntitlementCheck> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return { allowed: false, reason: 'Organization not found' };

    const plan = (org as any).currentPlan || 'starter';

    // V3 plans: all features are enabled for all paying customers
    if (isV3Plan(plan) && plan !== 'cloud_community') {
      return { allowed: true };
    }
    // V3 community: all features also enabled
    if (plan === 'cloud_community') {
      return { allowed: true };
    }

    // V2 legacy: check feature flags
    const features = (org as any).features || {};
    const featureKey = feature + 'Enabled';

    if (features[featureKey] === true || features[feature] === true) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Feature '${feature}' is not enabled on your current plan`,
    };
  }

  async checkLimit(orgId: string, limitType: 'runs' | 'users' | 'conversations'): Promise<EntitlementCheck> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return { allowed: false, reason: 'Organization not found' };

    const plan = (org as any).currentPlan || 'starter';

    // V3 plans: unified run counting
    if (isV3Plan(plan)) {
      if (limitType === 'users') return { allowed: true };

      // For V3, both 'runs' and 'conversations' check against unified run count
      const unifiedUsage = await getUnifiedRunCount();
      const limit = V3_RUN_LIMITS[plan] ?? 500;

      if (limit === Infinity) {
        return { allowed: true, currentUsage: unifiedUsage, limit: -1 };
      }

      if (unifiedUsage >= limit) {
        return {
          allowed: false,
          reason: `Run limit exceeded (${unifiedUsage}/${limit})`,
          currentUsage: unifiedUsage,
          limit,
        };
      }

      const warning = unifiedUsage / limit >= 0.8
        ? `Runs usage at ${Math.round((unifiedUsage / limit) * 100)}%`
        : undefined;

      return { allowed: true, currentUsage: unifiedUsage, limit, warning };
    }

    // V2 legacy: separate runs/conversations
    const currentUsage = await getUsageForLimit(limitType);

    let limit: number;
    switch (limitType) {
      case 'runs': {
        const override = (org as any).runsOverride;
        limit = override ?? PLAN_RUN_LIMITS[plan] ?? 100;
        break;
      }
      case 'conversations':
      case 'users':
        return { allowed: true };
      default:
        return { allowed: true };
    }

    if (limit === Infinity || limit === -1) {
      return { allowed: true, currentUsage, limit: -1 };
    }

    if (currentUsage >= limit) {
      return {
        allowed: false,
        reason: `${limitType} limit exceeded (${currentUsage}/${limit})`,
        currentUsage,
        limit,
      };
    }

    const warning = currentUsage / limit >= 0.8
      ? `${limitType} usage at ${Math.round((currentUsage / limit) * 100)}%`
      : undefined;

    return { allowed: true, currentUsage, limit, warning };
  }

  async getStatus(orgId: string): Promise<OrgEntitlementStatus> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    const plan = (org as any)?.currentPlan || 'starter';
    const snapshot = await getMeteringSnapshot();

    // V3: unified run count
    if (isV3Plan(plan)) {
      const unifiedRuns = snapshot.runsThisMonth + 0;
      const runLimit = V3_RUN_LIMITS[plan] ?? 500;

      const warnings: string[] = [];
      if (runLimit !== Infinity && unifiedRuns / runLimit >= 0.8) {
        warnings.push(`Runs usage at ${Math.round((unifiedRuns / runLimit) * 100)}%`);
      }

      return {
        tier: plan,
        limits: {
          runs: runLimit === Infinity ? -1 : runLimit,
          conversations: -1, // unified, no separate limit
          users: -1,
        },
        usage: {
          runs: unifiedRuns,
          conversations: 0,
          users: snapshot.activeUsers,
        },
        warnings,
      };
    }

    // V2 legacy
    const runLimit = PLAN_RUN_LIMITS[plan] ?? 100;
    const warnings: string[] = [];
    if (runLimit !== Infinity && snapshot.runsThisMonth / runLimit >= 0.8) {
      warnings.push(`Runs usage at ${Math.round((snapshot.runsThisMonth / runLimit) * 100)}%`);
    }

    return {
      tier: plan,
      limits: {
        runs: runLimit === Infinity ? -1 : runLimit,
        conversations: -1,
        users: -1,
      },
      usage: {
        runs: snapshot.runsThisMonth,
        conversations: 0,
        users: snapshot.activeUsers,
      },
      warnings,
    };
  }
}
