import { pgTable, text, uuid, timestamp, boolean, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// ---------------------------------------------------------------------------
// Evidence Models — schema definitions for evidence types
// ---------------------------------------------------------------------------
export const evidenceModels = pgTable('evidence_models', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),

  // JSON Schema defining the structure of evidence data
  dataSchema: jsonb('data_schema').$type<{
    type?: string;
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  }>().notNull(),

  // Example payloads to help users understand the format
  examples: jsonb('examples').$type<Array<{
    name: string;
    description?: string;
    data: unknown;
  }>>().default([]),

  // Webhook configuration for async processing notification
  webhook: jsonb('webhook').$type<{
    enabled?: boolean;
    url?: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    headers?: Record<string, string>;
    notifyOn?: 'processing_complete' | 'test_failure' | 'all';
    secret?: string;
  }>(),

  // Retention settings for evidence vault entries
  vault: jsonb('vault').$type<{
    retentionDays?: number;
    immutable?: boolean;
    autoArchive?: boolean;
  }>(),

  tags: jsonb('tags').$type<string[]>().default([]),
  createdBy: text('created_by'),
  disabled: boolean('disabled').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('evidence_models_org_name_unique').on(t.orgId, t.name),
  index('evidence_models_org_id_idx').on(t.orgId),
]);

// ---------------------------------------------------------------------------
// Evidence Vault Entries — stored evidence submissions
// ---------------------------------------------------------------------------
export type EvidenceStorageMode = 'lamdis_hosted' | 'customer_owned';
export type EvidenceStatus = 'received' | 'validating' | 'processing' | 'completed' | 'failed' | 'validated';
export type EvidenceOverallResult = 'pass' | 'fail' | 'error' | 'pending' | 'no_tests';

export const evidenceVaultEntries = pgTable('evidence_vault_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),

  // Reference to the evidence model this entry conforms to
  evidenceModelId: uuid('evidence_model_id').notNull().references(() => evidenceModels.id),

  // The actual evidence data (null in customer_owned mode)
  data: jsonb('data'),

  // Storage mode: where raw evidence lives
  storageMode: text('storage_mode').default('lamdis_hosted').$type<EvidenceStorageMode>(),

  // Pointer to raw artifact in customer storage (customer_owned mode only)
  artifactPointer: jsonb('artifact_pointer').$type<{
    provider?: 's3';
    bucket?: string;
    key?: string;
    region?: string;
    size?: number;
    contentType?: string;
    uploadedAt?: string;
  }>(),

  // SHA-256 hash of the raw submitted data for integrity verification
  submittedDataHashSha256: text('submitted_data_hash_sha256'),

  // Derived evidence extracted before raw data was discarded (customer_owned mode)
  derivedEvidence: jsonb('derived_evidence').$type<Array<{
    type: string;
    label?: string;
    data: unknown;
    extractedAt?: string;
  }>>(),

  // Human-readable reasoning summary (no raw content)
  reasoningSummary: text('reasoning_summary'),

  // Processing status
  status: text('status').default('received').$type<EvidenceStatus>(),

  // Validation results
  validation: jsonb('validation').$type<{
    isValid?: boolean;
    errors?: string[];
    warnings?: string[];
  }>(),

  // Processing metadata
  processing: jsonb('processing').$type<{
    startedAt?: string;
    completedAt?: string;
    duration?: number;
    testsRun?: number;
    testsPassed?: number;
    testsFailed?: number;
    error?: string;
  }>(),

  // Quick access to overall result
  overallResult: text('overall_result').default('pending').$type<EvidenceOverallResult>(),

  // Detailed test summary
  testSummary: jsonb('test_summary').$type<{
    total: number;
    passed: number;
    failed: number;
    error: number;
  }>(),

  // Full test results
  testResults: jsonb('test_results').$type<Array<{
    testId?: string;
    testName?: string;
    category?: string;
    status: 'passed' | 'failed' | 'error';
    assertions?: Array<{
      assertionIndex?: number;
      assertionName?: string;
      assertionType?: string;
      pass?: boolean;
      score?: number;
      reasoning?: string;
      latencyMs?: number;
    }>;
  }>>(),

  // When checks were evaluated
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }),

  // Source information
  source: jsonb('source').$type<{
    systemId?: string;
    referenceId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }>(),

  // Tags for categorization and filtering
  tags: jsonb('tags').$type<string[]>().default([]),

  // Flag for manual review
  flaggedForReview: boolean('flagged_for_review').default(false),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: text('reviewed_by'),
  reviewNotes: text('review_notes'),

  // Archive/deletion management
  archived: boolean('archived').default(false),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  scheduledDeletionAt: timestamp('scheduled_deletion_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('evidence_vault_entries_org_id_idx').on(t.orgId),
  index('evidence_vault_entries_model_id_idx').on(t.evidenceModelId),
  index('evidence_vault_entries_org_model_created_idx').on(t.orgId, t.evidenceModelId, t.createdAt),
  index('evidence_vault_entries_org_status_created_idx').on(t.orgId, t.status, t.createdAt),
  index('evidence_vault_entries_org_result_created_idx').on(t.orgId, t.overallResult, t.createdAt),
  index('evidence_vault_entries_org_flagged_idx').on(t.orgId, t.flaggedForReview),
  index('evidence_vault_entries_org_storage_created_idx').on(t.orgId, t.storageMode, t.createdAt),
  index('evidence_vault_entries_scheduled_deletion_idx').on(t.scheduledDeletionAt),
]);

// Evidence Access Logs are defined in ./audit.ts (evidenceAccessLogs table)
// Import from there if needed.
