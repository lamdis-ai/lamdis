import { licenseVerifier } from '../license/licenseVerifier.js';
import { getUsageForLimit, getMeteringSnapshot, getUnifiedRunCountYTD } from '../../services/meteringService.js';
import type { EntitlementAdapter, EntitlementCheck, OrgEntitlementStatus } from './entitlementAdapter.js';

/**
 * License-file entitlement adapter — used in self-hosted mode.
 * Reads the signed license file and checks usage against license limits.
 */
export class LicenseEntitlementAdapter implements EntitlementAdapter {
  readonly name = 'license_file';

  async checkFeature(_orgId: string, feature: string): Promise<EntitlementCheck> {
    const license = licenseVerifier.getEffectiveLicense();

    // V3 licenses: all features enabled when max_runs_per_year is set
    const isV3 = license.limits.max_runs_per_year !== undefined;
    if (isV3) {
      const result: EntitlementCheck = { allowed: true };
      const days = licenseVerifier.daysUntilExpiry();
      if (days >= 0 && days <= 30) {
        result.warning = `License expires in ${days} days`;
      } else if (licenseVerifier.isGracePeriod()) {
        result.warning = 'License expired — in grace period';
      }
      return result;
    }

    const features = license.features as unknown as Record<string, boolean>;
    const allowed = features[feature] === true;

    const result: EntitlementCheck = { allowed };

    if (!allowed) {
      result.reason = `Feature '${feature}' is not included in your ${license.tier} license`;
    }

    // Add expiry warning if applicable
    const days = licenseVerifier.daysUntilExpiry();
    if (days >= 0 && days <= 30) {
      result.warning = `License expires in ${days} days`;
    } else if (licenseVerifier.isGracePeriod()) {
      result.warning = 'License expired — in grace period';
    }

    return result;
  }

  async checkLimit(_orgId: string, limitType: 'runs' | 'users' | 'conversations'): Promise<EntitlementCheck> {
    const license = licenseVerifier.getEffectiveLicense();
    const isV3 = license.limits.max_runs_per_year !== undefined;

    // V3: unified runs/year. Users always unlimited. Conversations merged into runs.
    if (isV3) {
      if (limitType === 'users') {
        return { allowed: true, limit: -1 };
      }

      // Both 'runs' and 'conversations' check against unified runs/year
      const yearlyLimit = license.limits.max_runs_per_year!;
      if (yearlyLimit === -1) {
        return { allowed: true, limit: -1 };
      }

      // Count year-to-date unified runs
      const ytdUsage = await getUnifiedRunCountYTD();

      if (ytdUsage >= yearlyLimit) {
        return {
          allowed: false,
          reason: `Annual run limit exceeded (${ytdUsage.toLocaleString()}/${yearlyLimit.toLocaleString()} runs/year) on ${license.tier} license`,
          currentUsage: ytdUsage,
          limit: yearlyLimit,
        };
      }

      const result: EntitlementCheck = { allowed: true, currentUsage: ytdUsage, limit: yearlyLimit };
      if (ytdUsage / yearlyLimit >= 0.8) {
        result.warning = `Runs at ${Math.round((ytdUsage / yearlyLimit) * 100)}% of annual limit (${ytdUsage.toLocaleString()}/${yearlyLimit.toLocaleString()})`;
      }

      const days = licenseVerifier.daysUntilExpiry();
      if (days >= 0 && days <= 30) {
        result.warning = (result.warning ? result.warning + '. ' : '') + `License expires in ${days} days`;
      }

      return result;
    }

    // V2: original per-month limits
    const currentUsage = await getUsageForLimit(limitType);

    let limit: number;
    switch (limitType) {
      case 'runs':
        limit = license.limits.max_runs_per_month;
        break;
      case 'users':
        limit = license.limits.max_users;
        break;
      case 'conversations':
        limit = license.limits.max_conversations_per_month;
        break;
      default:
        return { allowed: true };
    }

    // -1 means unlimited
    if (limit === -1) {
      return { allowed: true, currentUsage, limit: -1 };
    }

    if (currentUsage >= limit) {
      return {
        allowed: false,
        reason: `${limitType} limit exceeded (${currentUsage}/${limit}) on ${license.tier} license`,
        currentUsage,
        limit,
      };
    }

    const result: EntitlementCheck = { allowed: true, currentUsage, limit };

    if (currentUsage / limit >= 0.8) {
      result.warning = `${limitType} usage at ${Math.round((currentUsage / limit) * 100)}%`;
    }

    // Add expiry warning
    const days = licenseVerifier.daysUntilExpiry();
    if (days >= 0 && days <= 30) {
      result.warning = (result.warning ? result.warning + '. ' : '') + `License expires in ${days} days`;
    }

    return result;
  }

  async getStatus(_orgId: string): Promise<OrgEntitlementStatus> {
    const license = licenseVerifier.getEffectiveLicense();
    const snapshot = await getMeteringSnapshot();
    const warnings: string[] = [];
    const limits = license.limits;
    const isV3 = limits.max_runs_per_year !== undefined;

    if (isV3) {
      // V3: unified runs, check YTD against yearly limit
      const ytdUsage = await getUnifiedRunCountYTD();
      const yearlyLimit = limits.max_runs_per_year!;
      if (yearlyLimit !== -1 && ytdUsage / yearlyLimit >= 0.8) {
        warnings.push(`Runs at ${Math.round((ytdUsage / yearlyLimit) * 100)}% of annual limit (${ytdUsage.toLocaleString()}/${yearlyLimit.toLocaleString()})`);
      }
    } else {
      // V2: separate limits
      if (limits.max_runs_per_month !== -1 && snapshot.runsThisMonth / limits.max_runs_per_month >= 0.8) {
        warnings.push(`Runs at ${Math.round((snapshot.runsThisMonth / limits.max_runs_per_month) * 100)}%`);
      }
      if (limits.max_users !== -1 && snapshot.activeUsers / limits.max_users >= 0.8) {
        warnings.push(`Users at ${Math.round((snapshot.activeUsers / limits.max_users) * 100)}%`);
      }
    }

    // Expiry warnings
    const days = licenseVerifier.daysUntilExpiry();
    if (days < 0) {
      warnings.push(`License expired ${Math.abs(days)} days ago`);
    } else if (days <= 30) {
      warnings.push(`License expires in ${days} days`);
    }

    const error = licenseVerifier.getLastError();
    if (error) {
      warnings.push(error);
    }

    const ytdUnified = isV3 ? await getUnifiedRunCountYTD() : 0;

    return {
      tier: license.tier,
      limits: {
        runs: isV3 ? (limits.max_runs_per_year !== -1 ? limits.max_runs_per_year! : -1) : limits.max_runs_per_month,
        conversations: isV3 ? -1 : limits.max_conversations_per_month,
        users: limits.max_users,
        organizations: limits.max_organizations,
      },
      usage: {
        runs: isV3 ? ytdUnified : snapshot.runsThisMonth,
        conversations: isV3 ? 0 : 0,
        users: snapshot.activeUsers,
      },
      warnings,
    };
  }
}
