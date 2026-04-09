import { pgTable, text, uuid, timestamp, integer, boolean, jsonb, doublePrecision, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// ---------------------------------------------------------------------------
// Test Packs — marketplace test pack catalog
// ---------------------------------------------------------------------------
export const testPacks = pgTable('test_packs', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  longDescription: text('long_description'),
  version: text('version').default('1.0.0'),
  frameworkSlugs: jsonb('framework_slugs').$type<string[]>().default([]),
  industries: jsonb('industries').$type<string[]>().default([]),
  useCases: jsonb('use_cases').$type<string[]>().default([]),
  tags: jsonb('tags').$type<string[]>().default([]),
  iconUrl: text('icon_url'),
  coverImageUrl: text('cover_image_url'),
  pricing: text('pricing').default('free'), // free, starter, pro, enterprise
  status: text('status').default('published'), // draft, review, published, deprecated, archived
  installCount: integer('install_count').default(0),
  isFeatured: boolean('is_featured').default(false),
  displayOrder: integer('display_order').default(0),
  defaultThresholds: jsonb('default_thresholds').$type<{
    passRate?: number;
    judgeScore?: number;
  }>(),
  testCount: integer('test_count').default(0),
  createdBy: text('created_by'),
  lastUpdatedBy: text('last_updated_by'),
  releaseNotes: text('release_notes'),
  changelog: jsonb('changelog').$type<Array<{
    version: string;
    date: string;
    notes: string;
  }>>().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('test_packs_slug_unique').on(t.slug),
  index('test_packs_status_idx').on(t.status),
  index('test_packs_featured_idx').on(t.isFeatured),
]);

// ---------------------------------------------------------------------------
// Pack Tests — individual tests within a pack
// ---------------------------------------------------------------------------
export const packTests = pgTable('pack_tests', {
  id: uuid('id').defaultRandom().primaryKey(),
  packSlug: text('pack_slug').notNull(),
  testKey: text('test_key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'),
  severity: text('severity').default('medium'), // critical, high, medium, low
  persona: jsonb('persona').$type<{
    name?: string;
    prompt?: string;
  }>(),
  steps: jsonb('steps').$type<Array<{
    type: 'user' | 'assistant' | 'extract' | 'action';
    content?: string;
    expectedBehavior?: string;
    assertions?: Array<{
      type?: string;
      field?: string;
      operator?: string;
      value?: unknown;
    }>;
  }>>().default([]),
  tags: jsonb('tags').$type<string[]>().default([]),
  frameworkControls: jsonb('framework_controls').$type<string[]>().default([]),
  displayOrder: integer('display_order').default(0),
  isEnabled: boolean('is_enabled').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('pack_tests_pack_slug_test_key_unique').on(t.packSlug, t.testKey),
  index('pack_tests_pack_slug_idx').on(t.packSlug),
]);

// ---------------------------------------------------------------------------
// Installed Packs — org-specific pack installations
// ---------------------------------------------------------------------------
export const installedPacks = pgTable('installed_packs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  packSlug: text('pack_slug').notNull(),
  installedVersion: text('installed_version').notNull(),
  suiteIds: jsonb('suite_ids').$type<string[]>().default([]),
  config: jsonb('config').$type<{
    thresholds?: {
      passRate?: number;
      judgeScore?: number;
    };
    disabledTests?: string[];
  }>(),
  installedBy: text('installed_by'),
  installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
  lastUpdated: timestamp('last_updated', { withTimezone: true }),
  status: text('status').default('active'), // active, paused, uninstalled
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('installed_packs_org_pack_slug_unique').on(t.orgId, t.packSlug),
  index('installed_packs_org_id_idx').on(t.orgId),
  index('installed_packs_pack_slug_idx').on(t.packSlug),
]);
