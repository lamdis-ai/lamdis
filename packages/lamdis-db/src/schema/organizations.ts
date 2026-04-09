import { pgTable, text, uuid, timestamp, integer, boolean, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug'),
  domain: text('domain'),

  // Auth0 Organization integration
  auth0OrgId: text('auth0_org_id'),
  auth0OrgName: text('auth0_org_name'),

  // Business profile (nested → JSONB)
  profile: jsonb('profile').$type<{
    description?: string;
    hours?: Record<string, string[]>;
    announcements?: string[];
    links?: Record<string, unknown>;
  }>().default({}),

  // Legacy single-domain verification
  verification: jsonb('verification').$type<{
    method?: string;
    value?: string;
    verifiedAt?: string;
  }>(),

  // Multi-domain support
  domains: jsonb('domains').$type<Array<{
    value: string;
    primary: boolean;
    verification: {
      status: string;
      method?: string | null;
      host?: string | null;
      expected?: string | null;
      verifiedAt?: string | null;
      lastCheckedAt?: string | null;
      strength?: string | null;
      expiresAt?: string | null;
    };
  }>>().default([]),

  stripeCustomerId: text('stripe_customer_id'),
  subscriptionStatus: text('subscription_status').default('none'),

  // Runs plan
  currentPlan: text('current_plan').default('runs_free'),
  // Seat management
  seats: integer('seats').default(1),
  runsSeatAllocation: jsonb('runs_seat_allocation').$type<{
    builders: number; reviewers: number; viewers: number;
  }>().default({ builders: 0, reviewers: 0, viewers: -1 }),

  // Free trial
  freeTrialStartedAt: timestamp('free_trial_started_at', { withTimezone: true }),
  freeTrialEndsAt: timestamp('free_trial_ends_at', { withTimezone: true }),
  freeTrialActivated: boolean('free_trial_activated').default(false),

  // Usage overrides
  runsOverride: integer('runs_override'),
  conversationsOverride: integer('conversations_override'),
  workflowExecutionsOverride: integer('workflow_executions_override'),
  analysisJobsOverride: integer('analysis_jobs_override'),

  // Feature flags (nested → JSONB)
  features: jsonb('features').$type<{
    ssoEnabled?: boolean;
    scimEnabled?: boolean;
    advancedRbacEnabled?: boolean;
    customRetentionEnabled?: boolean;
    dataResidencyEnabled?: boolean;
    legalHoldEnabled?: boolean;
    signedBundlesEnabled?: boolean;
    privateDeploymentEnabled?: boolean;
    immutableAuditEnabled?: boolean;
    siemExportEnabled?: boolean;
    customerOwnedVaultEnabled?: boolean;
  }>().default({}),

  // Retention config (nested → JSONB)
  retention: jsonb('retention').$type<{
    baseDays: number;
    addon?: string | null;
    perModel?: Record<string, number>;
    perChannel?: Record<string, number>;
  }>().default({ baseDays: 7 }),

  // Billing config (nested → JSONB)
  billing: jsonb('billing').$type<{
    annualCommit?: boolean;
    contractStartDate?: string | null;
    contractEndDate?: string | null;
    implementationPackage?: string | null;
    implementationCompleted?: boolean;
  }>().default({}),

  // Integrations (nested → JSONB, contains encrypted data)
  integrations: jsonb('integrations').$type<{
    openai?: Record<string, unknown>;
    providers?: Record<string, unknown>;
    oauthProviders?: Record<string, unknown>;
  }>(),

  // Manifest channels (nested → JSONB)
  manifest: jsonb('manifest').$type<{
    active?: string | null;
    blue?: string | null;
    green?: string | null;
    traffic?: number;
    providers?: Record<string, unknown>;
  }>(),

  // Dynamic connections map
  connections: jsonb('connections').default({}),

  // CI/CD config (nested → JSONB)
  cicdConfig: jsonb('cicd_config').$type<{
    enabled?: boolean;
    provider?: string;
    repoUrl?: string;
    accessToken_enc?: unknown;
    webhookUrl?: string;
    webhookSecret_enc?: unknown;
    commentOnPR?: boolean;
    failOnThreshold?: boolean;
    passThreshold?: number;
    includeDetails?: boolean;
  }>(),

  // Evidence vault config (nested → JSONB)
  evidenceVault: jsonb('evidence_vault').$type<{
    storageMode?: string;
    provider?: string | null;
    s3?: { bucket?: string; region?: string; prefix?: string };
    broker?: { url?: string; authHeader_enc?: unknown; healthCheckUrl?: string };
    jitTtlSeconds?: number;
    lastConnectionTest?: { success?: boolean; testedAt?: string; error?: string; latencyMs?: number };
  }>().default({ storageMode: 'lamdis_hosted' }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('organizations_slug_unique').on(t.slug),
  index('organizations_auth0_org_id_idx').on(t.auth0OrgId),
]);
