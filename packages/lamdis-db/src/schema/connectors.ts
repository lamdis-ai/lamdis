import { pgTable, text, uuid, timestamp, jsonb, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { credentialVaultEntries } from './identities';

// ---------------------------------------------------------------------------
// Connector Types — first-class taxonomy of supported external systems.
// Seeded with: google_drive, salesforce, slack, docusign, fax_http, generic_http
// ---------------------------------------------------------------------------
export type ConnectorCapability =
  | 'read_doc'
  | 'write_doc'
  | 'list_users'
  | 'list_groups'
  | 'send_message'
  | 'request_signature'
  | 'archive_evidence'
  | 'lookup_record'
  | 'update_record'
  | 'send_fax'
  | 'http_call';

export const connectorTypes = pgTable('connector_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull(), // 'google_drive', 'salesforce', etc.
  displayName: text('display_name').notNull(),
  description: text('description'),
  category: text('category').default('integration'), // 'document_store' | 'crm' | 'messaging' | 'signature' | 'fax' | 'integration'
  capabilities: jsonb('capabilities').$type<ConnectorCapability[]>().default([]),
  configSchema: jsonb('config_schema').$type<Record<string, unknown>>().default({}),
  authFlow: text('auth_flow').default('api_key'), // 'oauth2' | 'api_key' | 'username_password' | 'none'
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('connector_types_key_unique').on(t.key),
]);

// ---------------------------------------------------------------------------
// Connector Instances — a configured connection for an org to a specific system
// ---------------------------------------------------------------------------
export const connectorInstances = pgTable('connector_instances', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  connectorTypeId: uuid('connector_type_id').notNull().references(() => connectorTypes.id),
  name: text('name').notNull(),
  description: text('description'),
  config: jsonb('config').$type<Record<string, unknown>>().default({}),
  credentialVaultEntryId: uuid('credential_vault_entry_id').references(() => credentialVaultEntries.id),
  scope: text('scope').default('org'), // 'org' | 'objective' | 'workspace'
  scopeRef: text('scope_ref'),
  status: text('status').default('active'), // 'active' | 'paused' | 'error'
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('connector_instances_org_id_idx').on(t.orgId),
  index('connector_instances_org_type_idx').on(t.orgId, t.connectorTypeId),
  uniqueIndex('connector_instances_org_name_unique').on(t.orgId, t.name),
]);
