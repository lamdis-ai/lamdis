/**
 * Entitlement check for lamdis-runs.
 * Verifies that the org is entitled to execute runs before starting.
 *
 * In 'open' mode: always allowed (dev/testing).
 * In 'stripe' or 'license_file' mode: calls lamdis-api's internal entitlement endpoint.
 */

const ENTITLEMENTS_MODE = process.env.LAMDIS_ENTITLEMENTS_MODE || 'stripe';
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const API_TOKEN = process.env.LAMDIS_API_TOKEN || '';

export interface EntitlementResult {
  allowed: boolean;
  reason?: string;
}

export async function checkRunEntitlement(orgId: string): Promise<EntitlementResult> {
  // Open mode: no restrictions
  if (ENTITLEMENTS_MODE === 'open') {
    return { allowed: true };
  }

  // For both 'stripe' and 'license_file' modes, delegate to the API
  try {
    const res = await fetch(`${API_BASE_URL}/internal/entitlements/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': API_TOKEN,
      },
      body: JSON.stringify({ orgId, limitType: 'runs' }),
    });

    if (!res.ok) {
      console.warn(`[Entitlement] API returned ${res.status} for org ${orgId}`);
      // Fail open on API errors to avoid blocking runs due to transient issues
      return { allowed: true, reason: 'entitlement_check_failed_open' };
    }

    const data = await res.json() as EntitlementResult;
    return data;
  } catch (err: any) {
    console.warn(`[Entitlement] Failed to check entitlements for org ${orgId}:`, err?.message);
    // Fail open on network errors
    return { allowed: true, reason: 'entitlement_check_unreachable' };
  }
}
