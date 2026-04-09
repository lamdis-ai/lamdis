import { pgTable, text, uuid, timestamp, integer, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const connectors = pgTable('connectors', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  status: text('status').default('pending'), // 'pending','active','rejected'
  submittedByOrgId: uuid('submitted_by_org_id'),
  oauth: jsonb('oauth').$type<{
    type?: string;
    authUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
  }>(),
  configSchema: jsonb('config_schema'),
  actions: jsonb('actions').$type<unknown[]>().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('connectors_status_idx').on(t.status),
]);

export const connectorInstallations = pgTable('connector_installations', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  connectorId: uuid('connector_id').notNull().references(() => connectors.id),
  config: jsonb('config').default({}),
  tokens: jsonb('tokens').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('connector_installations_org_id_idx').on(t.orgId),
]);

export const domainClaims = pgTable('domain_claims', {
  id: uuid('id').defaultRandom().primaryKey(),
  domain: text('domain').notNull().unique(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const exportCaches = pgTable('export_caches', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  semver: text('semver').notNull(),
  format: text('format').notNull(), // 'lamdis','openapi','mcp','jsonld'
  content: text('content').notNull(),
  digestSha256: text('digest_sha256').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('export_caches_org_semver_format_unique').on(t.orgId, t.semver, t.format),
  index('export_caches_org_id_idx').on(t.orgId),
]);

export const orgVariables = pgTable('org_variables', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  key: text('key').notNull(),
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  tag: text('tag').notNull(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  revealedAt: timestamp('revealed_at', { withTimezone: true }),
  revealCount: integer('reveal_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('org_variables_org_key_unique').on(t.orgId, t.key),
  index('org_variables_org_id_idx').on(t.orgId),
]);

export const contactSubmissions = pgTable('contact_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  company: text('company'),
  message: text('message').notNull(),
  source: text('source').default('website'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('contact_submissions_email_idx').on(t.email),
]);
