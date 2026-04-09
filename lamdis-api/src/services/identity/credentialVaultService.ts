/**
 * Credential Vault Service
 *
 * Manages encrypted credentials scoped to identities, users, orgs, or objectives.
 * Supports the credential request flow: agent requests → user fulfills → encrypted + stored.
 *
 * Credential lookup waterfall:
 * 1. Check by provider + identity (agent's own credentials)
 * 2. Check by provider + objective (instance-scoped)
 * 3. Check by provider + org (shared org credentials)
 * 4. If not found → create a credential_request for the user to fill
 */

import { db } from '../../db.js';
import { credentialVaultEntries, credentialRequests } from '@lamdis/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { encrypt, decrypt } from '../../lib/crypto.js';

// ---------------------------------------------------------------------------
// Store / retrieve credentials
// ---------------------------------------------------------------------------

/**
 * Store an encrypted credential in the vault.
 */
export async function storeCredential(orgId: string, opts: {
  identityId?: string;
  ownerType: 'org' | 'user' | 'agent' | 'objective';
  ownerRef?: string;
  provider: string;
  credentialType?: string;
  label?: string;
  data: Record<string, unknown>; // plaintext credential data
  expiresAt?: Date;
}) {
  const encrypted = encrypt(opts.data);
  const ciphertext = typeof encrypted === 'string' ? encrypted : encrypted.data;
  const iv = typeof encrypted === 'string' ? '' : encrypted.iv;
  const tag = typeof encrypted === 'string' ? '' : encrypted.tag;

  const [entry] = await db.insert(credentialVaultEntries).values({
    orgId,
    identityId: opts.identityId,
    ownerType: opts.ownerType,
    ownerRef: opts.ownerRef,
    provider: opts.provider,
    credentialType: opts.credentialType || 'api_key',
    label: opts.label || `${opts.provider} credential`,
    ciphertext,
    iv,
    tag,
    expiresAt: opts.expiresAt,
    status: 'active',
  } as any).returning();

  return { id: entry.id, provider: entry.provider, label: entry.label };
}

/**
 * Get a credential by provider using the waterfall lookup:
 * identity → objective → org
 */
export async function getCredential(orgId: string, provider: string, opts?: {
  identityId?: string;
  ownerType?: string;
  ownerRef?: string;
}): Promise<{ data: Record<string, unknown>; scope: string; id: string } | null> {
  // 1. Check by identity
  if (opts?.identityId) {
    const [entry] = await db.select().from(credentialVaultEntries)
      .where(and(
        eq(credentialVaultEntries.orgId, orgId),
        eq(credentialVaultEntries.provider, provider),
        eq(credentialVaultEntries.identityId, opts.identityId),
        eq(credentialVaultEntries.status, 'active'),
      )).limit(1);
    if (entry) return { data: decryptEntry(entry), scope: 'identity', id: entry.id };
  }

  // 2. Check by owner ref (objective or user)
  if (opts?.ownerType && opts?.ownerRef) {
    const [entry] = await db.select().from(credentialVaultEntries)
      .where(and(
        eq(credentialVaultEntries.orgId, orgId),
        eq(credentialVaultEntries.provider, provider),
        eq(credentialVaultEntries.ownerType, opts.ownerType),
        eq(credentialVaultEntries.ownerRef, opts.ownerRef),
        eq(credentialVaultEntries.status, 'active'),
      )).limit(1);
    if (entry) return { data: decryptEntry(entry), scope: opts.ownerType, id: entry.id };
  }

  // 3. Check org-level
  const [orgEntry] = await db.select().from(credentialVaultEntries)
    .where(and(
      eq(credentialVaultEntries.orgId, orgId),
      eq(credentialVaultEntries.provider, provider),
      eq(credentialVaultEntries.ownerType, 'org'),
      eq(credentialVaultEntries.status, 'active'),
    )).limit(1);
  if (orgEntry) return { data: decryptEntry(orgEntry), scope: 'org', id: orgEntry.id };

  return null;
}

/**
 * List credential metadata (never returns decrypted data).
 */
export async function listCredentials(orgId: string, opts?: {
  provider?: string;
  ownerType?: string;
}) {
  const all = await db.select({
    id: credentialVaultEntries.id,
    provider: credentialVaultEntries.provider,
    credentialType: credentialVaultEntries.credentialType,
    label: credentialVaultEntries.label,
    ownerType: credentialVaultEntries.ownerType,
    ownerRef: credentialVaultEntries.ownerRef,
    status: credentialVaultEntries.status,
    expiresAt: credentialVaultEntries.expiresAt,
    lastUsedAt: credentialVaultEntries.lastUsedAt,
    lastRotatedAt: credentialVaultEntries.lastRotatedAt,
    createdAt: credentialVaultEntries.createdAt,
  }).from(credentialVaultEntries)
    .where(eq(credentialVaultEntries.orgId, orgId))
    .orderBy(desc(credentialVaultEntries.createdAt));

  return all.filter(c => {
    if (opts?.provider && c.provider !== opts.provider) return false;
    if (opts?.ownerType && c.ownerType !== opts.ownerType) return false;
    return true;
  });
}

/**
 * Revoke a credential.
 */
export async function revokeCredential(orgId: string, credentialId: string) {
  await db.update(credentialVaultEntries)
    .set({ status: 'revoked', updatedAt: new Date() } as any)
    .where(and(eq(credentialVaultEntries.orgId, orgId), eq(credentialVaultEntries.id, credentialId)));
}

/**
 * Rotate a credential with new data.
 */
export async function rotateCredential(orgId: string, credentialId: string, newData: Record<string, unknown>) {
  const encrypted = encrypt(newData);
  const ciphertext = typeof encrypted === 'string' ? encrypted : encrypted.data;
  const iv = typeof encrypted === 'string' ? '' : encrypted.iv;
  const tag = typeof encrypted === 'string' ? '' : encrypted.tag;

  const [updated] = await db.update(credentialVaultEntries)
    .set({ ciphertext, iv, tag, lastRotatedAt: new Date(), updatedAt: new Date() } as any)
    .where(and(eq(credentialVaultEntries.orgId, orgId), eq(credentialVaultEntries.id, credentialId)))
    .returning();

  return updated;
}

/**
 * Mark a credential as used (updates lastUsedAt).
 */
export async function touchCredential(credentialId: string) {
  await db.update(credentialVaultEntries)
    .set({ lastUsedAt: new Date() } as any)
    .where(eq(credentialVaultEntries.id, credentialId));
}

// ---------------------------------------------------------------------------
// Credential Requests — agent asks user to provide credentials
// ---------------------------------------------------------------------------

/**
 * Create a credential request (agent needs credentials it doesn't have).
 */
export async function requestCredential(orgId: string, opts: {
  outcomeInstanceId?: string;
  identityId?: string;
  provider: string;
  credentialType?: string;
  reason: string;
  fieldsNeeded?: Array<{ key: string; label: string; type: string; required: boolean; description?: string }>;
}) {
  // Check if there's already a pending request for this provider
  const [existing] = await db.select().from(credentialRequests)
    .where(and(
      eq(credentialRequests.orgId, orgId),
      eq(credentialRequests.provider, opts.provider),
      eq(credentialRequests.status, 'pending'),
    )).limit(1);

  if (existing) return existing;

  const [request] = await db.insert(credentialRequests).values({
    orgId,
    outcomeInstanceId: opts.outcomeInstanceId,
    identityId: opts.identityId,
    provider: opts.provider,
    credentialType: opts.credentialType || 'api_key',
    reason: opts.reason,
    fieldsNeeded: opts.fieldsNeeded || [],
    status: 'pending',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  } as any).returning();

  return request;
}

/**
 * List pending credential requests for an org.
 */
export async function listCredentialRequests(orgId: string, opts?: {
  status?: string;
  outcomeInstanceId?: string;
}) {
  const all = await db.select().from(credentialRequests)
    .where(eq(credentialRequests.orgId, orgId))
    .orderBy(desc(credentialRequests.createdAt));

  return all.filter(r => {
    if (opts?.status && r.status !== opts.status) return false;
    if (opts?.outcomeInstanceId && r.outcomeInstanceId !== opts.outcomeInstanceId) return false;
    return true;
  });
}

/**
 * Fulfill a credential request — user provides the credential data.
 */
export async function fulfillCredentialRequest(orgId: string, requestId: string, opts: {
  data: Record<string, unknown>;
  respondedBy: string;
}) {
  const [request] = await db.select().from(credentialRequests)
    .where(and(eq(credentialRequests.orgId, orgId), eq(credentialRequests.id, requestId)))
    .limit(1);

  if (!request) throw new Error('Credential request not found');
  if (request.status !== 'pending') throw new Error('Request is not pending');

  // Store the credential
  const credential = await storeCredential(orgId, {
    identityId: request.identityId || undefined,
    ownerType: 'org',
    provider: request.provider,
    credentialType: request.credentialType || 'api_key',
    label: `${request.provider} (requested by agent)`,
    data: opts.data,
  });

  // Mark request as fulfilled
  await db.update(credentialRequests).set({
    status: 'fulfilled',
    respondedBy: opts.respondedBy,
    respondedAt: new Date(),
    updatedAt: new Date(),
  } as any).where(eq(credentialRequests.id, requestId));

  return credential;
}

/**
 * Deny a credential request.
 */
export async function denyCredentialRequest(orgId: string, requestId: string, respondedBy: string) {
  await db.update(credentialRequests).set({
    status: 'denied',
    respondedBy,
    respondedAt: new Date(),
    updatedAt: new Date(),
  } as any).where(and(eq(credentialRequests.orgId, orgId), eq(credentialRequests.id, requestId)));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decryptEntry(entry: any): Record<string, unknown> {
  if (!entry.iv || !entry.tag) {
    // Not encrypted (dev mode)
    try { return JSON.parse(entry.ciphertext); } catch { return { value: entry.ciphertext }; }
  }
  return decrypt({ data: entry.ciphertext, iv: entry.iv, tag: entry.tag });
}
