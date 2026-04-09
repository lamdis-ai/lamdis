import { getMeteringSnapshot } from '../../services/meteringService.js';
import type { EntitlementAdapter, EntitlementCheck, OrgEntitlementStatus } from './entitlementAdapter.js';

/**
 * Open entitlement adapter — used for LAMDIS_ENTITLEMENTS_MODE=open.
 * Everything is allowed, no limits enforced. For development and testing only.
 */
export class OpenEntitlementAdapter implements EntitlementAdapter {
  readonly name = 'open';

  async checkFeature(): Promise<EntitlementCheck> {
    return { allowed: true };
  }

  async checkLimit(): Promise<EntitlementCheck> {
    return { allowed: true, limit: -1 };
  }

  async getStatus(): Promise<OrgEntitlementStatus> {
    const snapshot = await getMeteringSnapshot();
    return {
      tier: 'open',
      limits: { runs: -1, conversations: -1, users: -1 },
      usage: {
        runs: snapshot.runsThisMonth,
        conversations: 0,
        users: snapshot.activeUsers,
      },
      warnings: [],
    };
  }
}
