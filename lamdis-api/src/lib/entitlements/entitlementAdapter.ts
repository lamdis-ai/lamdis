/**
 * Common interface for entitlement checking.
 * Implemented by Stripe (cloud), license file (self-hosted), and open (dev) adapters.
 */

export interface EntitlementCheck {
  allowed: boolean;
  reason?: string;
  currentUsage?: number;
  limit?: number;
  /** Warning message (e.g. "License expires in 12 days") */
  warning?: string;
}

export interface OrgEntitlementStatus {
  tier: string;
  limits: Record<string, number>;
  usage: Record<string, number>;
  warnings: string[];
}

export interface EntitlementAdapter {
  /** Human-readable adapter name */
  readonly name: string;

  /**
   * Check whether a feature is enabled for this org.
   * e.g. checkFeature(orgId, 'sso')
   */
  checkFeature(orgId: string, feature: string): Promise<EntitlementCheck>;

  /**
   * Check whether usage is within limits for a given type.
   * e.g. checkLimit(orgId, 'runs')
   */
  checkLimit(orgId: string, limitType: 'runs' | 'users' | 'conversations'): Promise<EntitlementCheck>;

  /**
   * Get full entitlement status for an org (for display in UI).
   */
  getStatus(orgId: string): Promise<OrgEntitlementStatus>;
}
