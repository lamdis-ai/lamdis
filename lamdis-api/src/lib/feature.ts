// Global feature switches (beta gates)
export function isHostedActionsEnabled() {
  // Explicit environment flag wins
  const v = process.env.FEATURE_HOSTED_ACTIONS;
  if (v != null) {
    const s = String(v).toLowerCase();
    return s === '1' || s === 'true' || s === 'on' || s === 'yes';
  }
  // Dev override enables all features for local testing
  if (process.env.LAMDIS_DEV_FEATURES === '1') return true;
  // Default: disabled in production unless explicitly enabled; enabled in non-prod only if opted-in
  return false;
}

// Check if customer-owned vault mode is enabled for an org
export function isCustomerOwnedVaultEnabled(org: any): boolean {
  if (process.env.LAMDIS_DEV_FEATURES === '1') return true;
  return !!(org?.features?.customerOwnedVaultEnabled);
}

// Check if the org's evidence vault is in customer-owned mode
export function isCustomerOwnedStorageMode(org: any): boolean {
  return isCustomerOwnedVaultEnabled(org) && org?.evidenceVault?.storageMode === 'customer_owned';
}

export function assertFeature(org: any, feature: 'verifiedPublishing') {
  // Local dev override: set LAMDIS_DEV_FEATURES=1 to bypass gating for tests
  if (process.env.LAMDIS_DEV_FEATURES === '1') return;
  const plan = (org as any)?.currentPlan;
  const enabled = plan === 'pro' || plan === 'enterprise';
  if (!enabled) throw new Error(`Feature ${feature} requires Pro plan`);
}
