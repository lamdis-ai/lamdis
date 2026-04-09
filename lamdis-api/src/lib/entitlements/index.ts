import { entitlementsMode } from '../deploymentMode.js';
import type { EntitlementAdapter } from './entitlementAdapter.js';
import { StripeEntitlementAdapter } from './stripeAdapter.js';
import { LicenseEntitlementAdapter } from './licenseAdapter.js';
import { OpenEntitlementAdapter } from './openAdapter.js';

let _adapter: EntitlementAdapter | null = null;

/**
 * Returns the singleton entitlement adapter based on LAMDIS_ENTITLEMENTS_MODE.
 */
export function getEntitlementAdapter(): EntitlementAdapter {
  if (_adapter) return _adapter;

  switch (entitlementsMode) {
    case 'stripe':
      _adapter = new StripeEntitlementAdapter();
      break;
    case 'license_file':
      _adapter = new LicenseEntitlementAdapter();
      break;
    case 'open':
      _adapter = new OpenEntitlementAdapter();
      break;
    default:
      throw new Error(`Unknown LAMDIS_ENTITLEMENTS_MODE: ${entitlementsMode}`);
  }

  return _adapter;
}

export type { EntitlementAdapter, EntitlementCheck, OrgEntitlementStatus } from './entitlementAdapter.js';
