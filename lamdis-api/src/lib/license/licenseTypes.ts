/**
 * License payload embedded in the signed JWS/JWT file.
 * The private signing key is held securely by Lamdis;
 * the public verification key is embedded in the application.
 */

export type LicenseTier =
  | 'community'
  | 'nonprofit'
  | 'design_partner'
  | 'demo'
  | 'team'
  | 'business'
  | 'enterprise';

export interface LicenseLimits {
  /** Maximum active users (-1 = unlimited) */
  max_users: number;
  /** Maximum test runs per calendar month (-1 = unlimited) */
  max_runs_per_month: number;
  /** Maximum conversations per calendar month (-1 = unlimited) */
  max_conversations_per_month: number;
  /** Maximum organizations (-1 = unlimited) */
  max_organizations: number;
  /** V3: Maximum unified runs per year (-1 = unlimited). When set, replaces per-month limits. */
  max_runs_per_year?: number;
}

export interface LicenseFeatures {
  sso: boolean;
  scim: boolean;
  advanced_rbac: boolean;
  custom_retention: boolean;
  audit_export: boolean;
  evidence_vault: boolean;
  signed_bundles: boolean;
  siem_export: boolean;
}

export interface LicensePayload {
  /** Issuer — always "lamdis.ai" */
  iss: string;
  /** Subject — customer_id */
  sub: string;
  /** Issued at (unix timestamp) */
  iat: number;
  /** Expiry (unix timestamp) */
  exp: number;
  /** License tier */
  tier: LicenseTier;
  /** Usage limits */
  limits: LicenseLimits;
  /** Feature flags */
  features: LicenseFeatures;
  /** Optional deployment binding */
  deployment_id?: string;
  /** Arbitrary metadata (customer name, etc.) */
  metadata?: Record<string, any>;
}

/** Default limits for the community (fallback) tier — V3: runs/year based */
export const COMMUNITY_LIMITS: LicenseLimits = {
  max_users: -1, // V3: unlimited users
  max_runs_per_month: -1, // V3: use max_runs_per_year instead
  max_conversations_per_month: -1, // V3: unified into runs
  max_organizations: 1,
  max_runs_per_year: 25000, // V3: 25k runs/year for community
};

/** Default features for the community tier — V3: all features enabled */
export const COMMUNITY_FEATURES: LicenseFeatures = {
  sso: true,
  scim: true,
  advanced_rbac: true,
  custom_retention: false,
  audit_export: true,
  evidence_vault: true,
  signed_bundles: false,
  siem_export: true,
};

/** Fallback license payload used when no valid license is present */
export const COMMUNITY_LICENSE: LicensePayload = {
  iss: 'lamdis.ai',
  sub: 'unlicensed',
  iat: 0,
  exp: 0,
  tier: 'community',
  limits: COMMUNITY_LIMITS,
  features: COMMUNITY_FEATURES,
};
