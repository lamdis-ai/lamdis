import { pgTable, text, uuid, timestamp, boolean, integer, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const manifests = pgTable('manifests', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  visibility: text('visibility').default('public'), // 'public','external','internal','private'
  externalPublishedAt: timestamp('external_published_at', { withTimezone: true }),
  externalSlug: text('external_slug'),
  allowedConsumers: jsonb('allowed_consumers').$type<{
    type?: string;
    orgSlugs?: string[];
    domains?: string[];
  }>(),
  channels: jsonb('channels').$type<{
    active?: string | null;
    blue?: string | null;
    green?: string | null;
    traffic?: number;
  }>(),
  providers: jsonb('providers').default({}),
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('manifests_org_slug_unique').on(t.orgId, t.slug),
  index('manifests_org_id_idx').on(t.orgId),
  index('manifests_visibility_idx').on(t.visibility),
  index('manifests_external_slug_idx').on(t.externalSlug),
]);

export const manifestVersions = pgTable('manifest_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  manifestId: uuid('manifest_id').references(() => manifests.id),
  semver: text('semver').notNull(),
  actions: jsonb('actions').$type<unknown[]>().default([]),
  providers: jsonb('providers').default({}),
  digestSha256: text('digest_sha256').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('manifest_versions_org_semver_unique').on(t.orgId, t.semver),
  index('manifest_versions_org_id_idx').on(t.orgId),
  index('manifest_versions_manifest_id_idx').on(t.manifestId),
]);

export const manifestActionMaps = pgTable('manifest_action_maps', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  manifestId: uuid('manifest_id').notNull().references(() => manifests.id),
  actionIds: jsonb('action_ids').$type<string[]>().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('manifest_action_maps_org_manifest_unique').on(t.orgId, t.manifestId),
  index('manifest_action_maps_org_id_idx').on(t.orgId),
]);

export const manifestAccessLogs = pgTable('manifest_access_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull(),
  manifestVersionId: uuid('manifest_version_id'),
  slug: text('slug'),
  pathType: text('path_type'), // 'lamdis','openapi','mcp','schemaorg','wellknown'
  digest: text('digest'),
  ts: timestamp('ts', { withTimezone: true }).defaultNow().notNull(),
  ua: text('ua'),
  ipHash: text('ip_hash'),
}, (t) => [
  index('manifest_access_logs_org_ts_idx').on(t.orgId, t.ts),
  index('manifest_access_logs_path_type_ts_idx').on(t.pathType, t.ts),
  index('manifest_access_logs_slug_idx').on(t.slug),
  index('manifest_access_logs_ip_hash_idx').on(t.ipHash),
]);
