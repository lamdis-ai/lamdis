import { pgTable, text, uuid, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// ---------------------------------------------------------------------------
// Agent Identities — executors with their own credentials and capabilities
// ---------------------------------------------------------------------------
export const agentIdentities = pgTable('agent_identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  identityType: text('identity_type').notNull().default('system_agent'), // 'system_agent' | 'user_delegate' | 'service_account'
  delegateForUserSub: text('delegate_for_user_sub'), // nullable, for "on behalf of" mode
  capabilities: jsonb('capabilities').$type<string[]>().default([]), // e.g. ['web_browse', 'code_execute', 'sms_send']
  credentialPolicy: text('credential_policy').default('own'), // 'own' | 'delegate' | 'org_shared'
  status: text('status').default('active'), // 'active' | 'suspended' | 'revoked'
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('agent_identities_org_id_idx').on(t.orgId),
  index('agent_identities_org_type_idx').on(t.orgId, t.identityType),
]);

// ---------------------------------------------------------------------------
// Credential Vault Entries — encrypted credentials scoped to identity/user/org/objective
// ---------------------------------------------------------------------------
export const credentialVaultEntries = pgTable('credential_vault_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  identityId: uuid('identity_id').references(() => agentIdentities.id),
  ownerType: text('owner_type').notNull().default('org'), // 'org' | 'user' | 'agent' | 'objective'
  ownerRef: text('owner_ref'), // userSub, agentIdentityId, or outcomeInstanceId
  provider: text('provider').notNull(), // e.g. 'facebook', 'twilio', 'github', 'aws', 'stripe'
  credentialType: text('credential_type').notNull().default('api_key'), // 'oauth2' | 'api_key' | 'username_password' | 'token' | 'certificate'
  label: text('label'),
  // Encrypted storage — same AES-256-GCM pattern as orgVariables
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  tag: text('tag').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  lastRotatedAt: timestamp('last_rotated_at', { withTimezone: true }),
  status: text('status').default('active'), // 'active' | 'expired' | 'revoked' | 'pending_user_input'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('credential_vault_org_id_idx').on(t.orgId),
  index('credential_vault_org_provider_idx').on(t.orgId, t.provider),
  index('credential_vault_identity_idx').on(t.identityId),
  index('credential_vault_org_owner_idx').on(t.orgId, t.ownerType, t.ownerRef),
]);

// ---------------------------------------------------------------------------
// Credential Requests — agent asks human to provide credentials
// ---------------------------------------------------------------------------
export const credentialRequests = pgTable('credential_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  outcomeInstanceId: uuid('outcome_instance_id'),
  identityId: uuid('identity_id').references(() => agentIdentities.id),
  provider: text('provider').notNull(),
  credentialType: text('credential_type').notNull().default('api_key'),
  reason: text('reason'), // why the agent needs this
  fieldsNeeded: jsonb('fields_needed').$type<Array<{
    key: string;
    label: string;
    type: 'text' | 'password' | 'url' | 'email';
    required: boolean;
    description?: string;
  }>>().default([]),
  status: text('status').default('pending'), // 'pending' | 'fulfilled' | 'denied' | 'expired'
  respondedBy: text('responded_by'),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('credential_requests_org_id_idx').on(t.orgId),
  index('credential_requests_org_status_idx').on(t.orgId, t.status),
  index('credential_requests_instance_idx').on(t.outcomeInstanceId),
]);
