/**
 * Auth0 Organization Service
 * 
 * Handles creation and management of Auth0 Organizations,
 * syncing with local MongoDB organization records.
 */
import { getAuth0Mgmt, getDefaultConnectionId, getAppClientId, isAuth0MgmtConfigured } from '../lib/auth0-mgmt.js';
import { db } from '../db.js';
import { organizations, members } from '@lamdis/db/schema';
import { eq, and } from 'drizzle-orm';
import { ulid } from 'ulid';

/**
 * Generate a URL-safe organization slug from a display name
 */
function slugifyOrgName(displayName: string): string {
  const base = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${base}_${suffix}`;
}

export interface CreateOrgOptions {
  displayName: string;
  creatorUserId: string; // Auth0 user_id (sub), e.g., "auth0|abc123"
  creatorEmail?: string;
  inviteOnly?: boolean; // Default true - require invitations to join
}

export interface CreateOrgResult {
  auth0OrgId: string;
  auth0OrgName: string;
  localOrgId: string;
  org: any;
}

/**
 * Create a new organization in both Auth0 and local MongoDB.
 * 
 * 1. Creates Auth0 Organization
 * 2. Enables default connection for the org
 * 3. Adds creator as Auth0 org member
 * 4. Creates local MongoDB Organization record
 * 5. Creates local Member record for creator as owner
 */
export async function createOrganization(opts: CreateOrgOptions): Promise<CreateOrgResult> {
  if (!isAuth0MgmtConfigured()) {
    throw new Error('Auth0 Management API not configured');
  }
  
  const auth0 = getAuth0Mgmt();
  const connectionId = getDefaultConnectionId();
  const orgName = slugifyOrgName(opts.displayName);
  
  // 1. Create Auth0 Organization
  const created = await auth0.organizations.create({
    name: orgName,
    display_name: opts.displayName,
    metadata: {
      product: 'lamdis',
      created_by: opts.creatorUserId,
    },
  });
  
  const auth0OrgId = (created as any).id;
  if (!auth0OrgId) throw new Error('Auth0 did not return an organization id');
  
  try {
    // 2. Enable default DB connection for the org
    await auth0.organizations.enabledConnections.add(auth0OrgId, {
      connection_id: connectionId,
      assign_membership_on_login: false, // Require explicit invitation
      show_as_button: true,
    });
    
    // 3. Add creator as Auth0 org member
    await auth0.organizations.members.create(auth0OrgId, {
      members: [opts.creatorUserId],
    });
    
    // 4. Create local Organization
    // New orgs always start on free plan (null = free tier)
    const localSlug = `org-${ulid().toLowerCase()}`;

    const [org] = await db.insert(organizations).values({
      name: opts.displayName,
      slug: localSlug,
      auth0OrgId: auth0OrgId,
      auth0OrgName: orgName,
      currentPlan: null,
    }).returning();

    // 5. Create local Member record
    await db.insert(members).values({
      orgId: org.id,
      userSub: opts.creatorUserId,
      email: opts.creatorEmail?.toLowerCase(),
      role: 'owner',
      status: 'active',
    });

    return {
      auth0OrgId,
      auth0OrgName: orgName,
      localOrgId: org.id,
      org,
    };
  } catch (error) {
    // If local creation fails, attempt to clean up Auth0 org
    try {
      await auth0.organizations.delete(auth0OrgId);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * List Auth0 organizations a user belongs to
 */
export async function listUserAuth0Orgs(userId: string) {
  if (!isAuth0MgmtConfigured()) {
    return { organizations: [] };
  }
  
  const auth0 = getAuth0Mgmt();
  const result = await auth0.users.organizations.list(userId);
  return { organizations: (result as any).data || result || [] };
}

/**
 * Get Auth0 organization by ID
 */
export async function getAuth0Org(orgId: string) {
  if (!isAuth0MgmtConfigured()) {
    throw new Error('Auth0 Management API not configured');
  }
  
  const auth0 = getAuth0Mgmt();
  const result = await auth0.organizations.get(orgId);
  return result;
}

/**
 * Delete an organization from both Auth0 and local DB
 */
export async function deleteOrganization(localOrgId: string): Promise<void> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, localOrgId)).limit(1);
  if (!org) throw new Error('Organization not found');

  // Delete from Auth0 if we have the ID
  const auth0OrgId = org.auth0OrgId;
  if (auth0OrgId && isAuth0MgmtConfigured()) {
    const auth0 = getAuth0Mgmt();
    try {
      await auth0.organizations.delete(auth0OrgId);
    } catch (error: any) {
      // Ignore 404 if org already deleted
      if (error?.statusCode !== 404) throw error;
    }
  }

  // Delete local records
  await db.delete(members).where(eq(members.orgId, localOrgId));
  await db.delete(organizations).where(eq(organizations.id, localOrgId));
}

/**
 * Sync Auth0 org membership to local DB (for users joining via Auth0)
 */
export async function syncMemberFromAuth0(auth0OrgId: string, userSub: string, email?: string): Promise<void> {
  // Find local org by Auth0 org ID
  const [org] = await db.select().from(organizations).where(eq(organizations.auth0OrgId, auth0OrgId)).limit(1);
  if (!org) {
    console.warn(`No local org found for Auth0 org ${auth0OrgId}`);
    return;
  }

  // Check if member already exists
  const [existing] = await db.select().from(members).where(
    and(
      eq(members.orgId, org.id),
      eq(members.userSub, userSub)
    )
  ).limit(1);
  if (existing) return;

  // Create member record
  await db.insert(members).values({
    orgId: org.id,
    userSub,
    email: email?.toLowerCase(),
    role: 'member',
    status: 'active',
    acceptedAt: new Date(),
  });
}
