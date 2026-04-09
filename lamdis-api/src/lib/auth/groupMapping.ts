import { env } from '../env.js';

export type LamdisRole = 'admin' | 'member' | 'viewer';

/**
 * Maps IdP group names to Lamdis roles using the OIDC_ROLE_MAP env var.
 *
 * Example OIDC_ROLE_MAP:
 *   '{"engineering-leads":"admin","qa-team":"member","executives":"viewer"}'
 *
 * Returns the highest-privilege matching role, falling back to 'viewer'.
 */

const ROLE_PRIORITY: Record<LamdisRole, number> = {
  admin: 3,
  member: 2,
  viewer: 1,
};

let roleMap: Record<string, LamdisRole> | null = null;

function getRoleMap(): Record<string, LamdisRole> {
  if (roleMap !== null) return roleMap;

  const raw = env.OIDC_ROLE_MAP;
  if (!raw) {
    roleMap = {};
    return roleMap;
  }

  try {
    roleMap = JSON.parse(raw) as Record<string, LamdisRole>;
  } catch (e) {
    console.error('[GroupMapping] Failed to parse OIDC_ROLE_MAP:', e);
    roleMap = {};
  }

  return roleMap;
}

/**
 * Given a list of IdP groups, returns the best matching Lamdis role.
 * If no group matches, returns 'viewer' as the default.
 */
export function mapGroupsToRole(groups: string[]): LamdisRole {
  const map = getRoleMap();
  let best: LamdisRole = 'viewer';
  let bestPriority = 0;

  for (const group of groups) {
    const mapped = map[group];
    if (mapped && ROLE_PRIORITY[mapped] > bestPriority) {
      best = mapped;
      bestPriority = ROLE_PRIORITY[mapped];
    }
  }

  return best;
}

/**
 * Check whether the given groups contain any admin-level mapping.
 */
export function isAdminGroup(groups: string[]): boolean {
  return mapGroupsToRole(groups) === 'admin';
}
