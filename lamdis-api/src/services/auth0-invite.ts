/**
 * Auth0 Invitation Service
 * 
 * Handles email invitations and invite code generation for organizations.
 */
import { getAuth0Mgmt, getAppClientId, getDefaultConnectionId, isAuth0MgmtConfigured } from '../lib/auth0-mgmt.js';
import { db } from '../db.js';
import { organizations, members, joinCodes } from '@lamdis/db/schema';
import { eq, and, gt, desc } from 'drizzle-orm';

/**
 * Generate a short, human-friendly join code
 */
function generateJoinCode(): string {
  // 6 character alphanumeric code (uppercase for readability)
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export interface InviteByEmailOptions {
  orgId: string; // Local MongoDB org ID
  inviteeEmail: string;
  inviterName: string;
  inviterSub: string;
  roleIds?: string[]; // Auth0 role IDs to assign
  localRole?: 'member' | 'admin' | 'owner';
}

export interface InviteByEmailResult {
  invitationId: string;
  invitationUrl: string;
  memberId: string;
}

/**
 * Invite a user to an organization via email.
 * Auth0 will send the invitation email.
 */
export async function inviteByEmail(opts: InviteByEmailOptions): Promise<InviteByEmailResult> {
  if (!isAuth0MgmtConfigured()) {
    throw new Error('Auth0 Management API not configured');
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.id, opts.orgId)).limit(1);
  if (!org) throw new Error('Organization not found');

  const auth0OrgId = org.auth0OrgId;
  if (!auth0OrgId) throw new Error('Organization not linked to Auth0');
  
  const auth0 = getAuth0Mgmt();
  const appClientId = getAppClientId();
  const connectionId = getDefaultConnectionId();
  
  // Create Auth0 invitation (Auth0 sends the email)
  const result = await auth0.organizations.invitations.create(auth0OrgId, {
    inviter: { name: opts.inviterName },
    invitee: { email: opts.inviteeEmail },
    client_id: appClientId,
    connection_id: connectionId,
    roles: opts.roleIds,
    ttl_sec: 60 * 60 * 24 * 7, // 7 days
    send_invitation_email: true,
  });
  
  const invitationId = (result as any).id;
  const invitationUrl = (result as any).invitation_url;
  
  if (!invitationId || !invitationUrl) {
    throw new Error('Auth0 did not return invitation details');
  }
  
  // Create local member record with 'invited' status
  const normEmail = opts.inviteeEmail.toLowerCase();
  const [existingMember] = await db.select().from(members).where(
    and(
      eq(members.orgId, opts.orgId),
      eq(members.email, normEmail)
    )
  ).limit(1);

  let memberId: string;
  if (existingMember) {
    memberId = existingMember.id;
    // Update role if specified and member is still invited
    if (existingMember.status === 'invited' && opts.localRole) {
      await db.update(members)
        .set({ role: opts.localRole })
        .where(eq(members.id, existingMember.id));
    }
  } else {
    const [member] = await db.insert(members).values({
      orgId: opts.orgId,
      email: normEmail,
      role: opts.localRole || 'member',
      status: 'invited',
      invitedBy: opts.inviterSub,
      invitedAt: new Date(),
    }).returning();
    memberId = member.id;
  }
  
  return {
    invitationId,
    invitationUrl,
    memberId,
  };
}

export interface CreateJoinCodeOptions {
  orgId: string; // Local MongoDB org ID
  creatorSub: string;
  creatorName: string;
  expiresInDays?: number; // Default 7
  maxUses?: number; // Optional limit
  role?: 'member' | 'admin'; // Role for users who join
}

export interface CreateJoinCodeResult {
  code: string;
  expiresAt: Date;
  auth0OrgId: string;
}

/**
 * Create a join code that users can enter to join an organization.
 * This creates an Auth0 invitation without sending an email.
 */
export async function createJoinCode(opts: CreateJoinCodeOptions): Promise<CreateJoinCodeResult> {
  if (!isAuth0MgmtConfigured()) {
    throw new Error('Auth0 Management API not configured');
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.id, opts.orgId)).limit(1);
  if (!org) throw new Error('Organization not found');

  const auth0OrgId = org.auth0OrgId;
  if (!auth0OrgId) throw new Error('Organization not linked to Auth0');
  
  const auth0 = getAuth0Mgmt();
  const appClientId = getAppClientId();
  const connectionId = getDefaultConnectionId();
  
  // Generate unique code
  let code: string;
  let attempts = 0;
  do {
    code = generateJoinCode();
    const [existing] = await db.select().from(joinCodes).where(eq(joinCodes.code, code)).limit(1);
    if (!existing) break;
    attempts++;
  } while (attempts < 10);

  if (attempts >= 10) {
    throw new Error('Failed to generate unique join code');
  }
  
  const ttlDays = opts.expiresInDays || 7;
  const ttlSec = 60 * 60 * 24 * ttlDays;
  const expiresAt = new Date(Date.now() + ttlSec * 1000);
  
  // Create Auth0 invitation without sending email
  // We use a placeholder email since Auth0 requires one
  const placeholderEmail = `join-${code.toLowerCase()}@placeholder.lamdis.ai`;
  
  const result = await auth0.organizations.invitations.create(auth0OrgId, {
    inviter: { name: opts.creatorName },
    invitee: { email: placeholderEmail },
    client_id: appClientId,
    connection_id: connectionId,
    ttl_sec: ttlSec,
    send_invitation_email: false, // Key: don't send email
  });
  
  const invitationId = (result as any).id;
  if (!invitationId) {
    throw new Error('Auth0 did not return invitation ID');
  }
  
  // Store code -> invitation mapping
  await db.insert(joinCodes).values({
    code,
    orgId: opts.orgId,
    auth0OrgId,
    invitationId,
    expiresAt,
    maxUses: opts.maxUses || null,
    createdBy: opts.creatorSub,
    role: opts.role || 'member',
  });
  
  return {
    code,
    expiresAt,
    auth0OrgId,
  };
}

export interface LookupJoinCodeResult {
  code: string;
  orgId: string;
  auth0OrgId: string;
  invitationId: string;
  role: string;
  orgName: string;
}

/**
 * Look up a join code and return the info needed to complete the join flow
 */
export async function lookupJoinCode(code: string): Promise<LookupJoinCodeResult | null> {
  const upperCode = code.toUpperCase().trim();

  const [joinCode] = await db.select().from(joinCodes).where(
    and(
      eq(joinCodes.code, upperCode),
      gt(joinCodes.expiresAt, new Date())
    )
  ).limit(1);

  if (!joinCode) return null;

  // Check max uses
  if (joinCode.maxUses && (joinCode.useCount || 0) >= joinCode.maxUses) {
    return null;
  }

  // Get org name for display
  const [org] = await db.select().from(organizations).where(eq(organizations.id, joinCode.orgId)).limit(1);
  if (!org) return null;

  return {
    code: joinCode.code || '',
    orgId: joinCode.orgId,
    auth0OrgId: joinCode.auth0OrgId || '',
    invitationId: joinCode.invitationId || '',
    role: joinCode.role || 'viewer',
    orgName: org.name,
  };
}

/**
 * Mark a join code as used (increment use count)
 */
export async function markJoinCodeUsed(code: string): Promise<void> {
  const upperCode = code.toUpperCase().trim();
  const [joinCode] = await db.select().from(joinCodes).where(eq(joinCodes.code, upperCode)).limit(1);
  if (joinCode) {
    await db.update(joinCodes)
      .set({ useCount: (joinCode.useCount || 0) + 1 })
      .where(eq(joinCodes.code, upperCode));
  }
}

/**
 * List active join codes for an organization
 */
export async function listJoinCodes(orgId: string) {
  const codes = await db.select().from(joinCodes).where(
    and(
      eq(joinCodes.orgId, orgId),
      gt(joinCodes.expiresAt, new Date())
    )
  ).orderBy(desc(joinCodes.createdAt));

  return codes.map(c => ({
    code: c.code,
    expiresAt: c.expiresAt,
    maxUses: c.maxUses,
    useCount: c.useCount,
    role: c.role,
    createdAt: c.createdAt,
  }));
}

/**
 * Delete/revoke a join code
 */
export async function deleteJoinCode(code: string, orgId: string): Promise<boolean> {
  const result = await db.delete(joinCodes).where(
    and(
      eq(joinCodes.code, code.toUpperCase().trim()),
      eq(joinCodes.orgId, orgId)
    )
  );
  return (result.rowCount || 0) > 0;
}

/**
 * List pending Auth0 invitations for an organization
 */
export async function listPendingInvitations(orgId: string) {
  if (!isAuth0MgmtConfigured()) {
    return [];
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) return [];

  const auth0OrgId = org.auth0OrgId;
  if (!auth0OrgId) return [];
  
  const auth0 = getAuth0Mgmt();
  const result = await auth0.organizations.invitations.list(auth0OrgId);
  
  return ((result as any).data || result || []).map((inv: any) => ({
    id: inv.id,
    email: inv.invitee?.email,
    createdAt: inv.created_at,
    expiresAt: inv.expires_at,
  }));
}

/**
 * Delete/revoke an Auth0 invitation
 */
export async function deleteInvitation(orgId: string, invitationId: string): Promise<boolean> {
  if (!isAuth0MgmtConfigured()) {
    return false;
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) return false;

  const auth0OrgId = org.auth0OrgId;
  if (!auth0OrgId) return false;
  
  const auth0 = getAuth0Mgmt();
  try {
    await auth0.organizations.invitations.delete(auth0OrgId, invitationId);
    return true;
  } catch (error: any) {
    if (error?.statusCode === 404) return false;
    throw error;
  }
}
