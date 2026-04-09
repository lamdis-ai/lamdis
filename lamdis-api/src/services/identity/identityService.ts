/**
 * Identity Service
 *
 * Manages agent identities — executors that can have their own credentials,
 * capabilities, and delegation relationships.
 *
 * Each org gets a default system_agent identity on first use.
 * Users can create user_delegate identities (agent acts on behalf of user)
 * and service_account identities for external integrations.
 */

import { db } from '../../db.js';
import { agentIdentities } from '@lamdis/db/schema';
import { eq, and } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createIdentity(orgId: string, opts: {
  name: string;
  identityType?: string;
  delegateForUserSub?: string;
  capabilities?: string[];
  credentialPolicy?: string;
}) {
  const [identity] = await db.insert(agentIdentities).values({
    orgId,
    name: opts.name,
    identityType: opts.identityType || 'system_agent',
    delegateForUserSub: opts.delegateForUserSub,
    capabilities: opts.capabilities || [],
    credentialPolicy: opts.credentialPolicy || 'own',
    status: 'active',
  } as any).returning();

  return identity;
}

export async function getIdentity(orgId: string, identityId: string) {
  const [identity] = await db.select().from(agentIdentities)
    .where(and(eq(agentIdentities.orgId, orgId), eq(agentIdentities.id, identityId)))
    .limit(1);
  return identity || null;
}

export async function listIdentities(orgId: string) {
  return db.select().from(agentIdentities)
    .where(eq(agentIdentities.orgId, orgId));
}

export async function updateIdentity(orgId: string, identityId: string, updates: Partial<{
  name: string;
  capabilities: string[];
  credentialPolicy: string;
}>) {
  const [updated] = await db.update(agentIdentities)
    .set({ ...updates, updatedAt: new Date() } as any)
    .where(and(eq(agentIdentities.orgId, orgId), eq(agentIdentities.id, identityId)))
    .returning();
  return updated;
}

export async function suspendIdentity(orgId: string, identityId: string) {
  return updateIdentity(orgId, identityId, {} as any);
}

// ---------------------------------------------------------------------------
// Default identity
// ---------------------------------------------------------------------------

/**
 * Get or create the default system_agent identity for an org.
 */
export async function getDefaultIdentity(orgId: string) {
  const [existing] = await db.select().from(agentIdentities)
    .where(and(
      eq(agentIdentities.orgId, orgId),
      eq(agentIdentities.identityType, 'system_agent'),
    )).limit(1);

  if (existing) return existing;

  return createIdentity(orgId, {
    name: 'Lamdis Agent',
    identityType: 'system_agent',
    capabilities: ['web_browse', 'code_execute', 'file_read', 'credential_store'],
  });
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Determine which identity should be used for a given action.
 * Priority: instance-specific > user-delegate > default system agent
 */
export async function resolveIdentity(orgId: string, opts?: {
  userSub?: string;
  instanceId?: string;
}) {
  // If we have a user sub, check for a delegate identity
  if (opts?.userSub) {
    const [delegate] = await db.select().from(agentIdentities)
      .where(and(
        eq(agentIdentities.orgId, orgId),
        eq(agentIdentities.delegateForUserSub, opts.userSub),
        eq(agentIdentities.status, 'active'),
      )).limit(1);
    if (delegate) return delegate;
  }

  // Fall back to default
  return getDefaultIdentity(orgId);
}
