import { pgTable, text, uuid, timestamp, integer, boolean, jsonb, doublePrecision, uniqueIndex, index, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// ---------------------------------------------------------------------------
// Outcome Groups — grouping container for outcome types (was: workflow_suites)
// ---------------------------------------------------------------------------
export const outcomeGroups = pgTable('outcome_groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  tags: jsonb('tags').$type<string[]>().default([]),
  schedule: jsonb('schedule').$type<{
    enabled: boolean;
    periodMinutes: number;
    nextRunAt?: string;
    lastRunAt?: string;
  }>(),
  thresholds: jsonb('thresholds').$type<{
    passRate?: number;
    judgeScore?: number;
  }>(),
  webhook: jsonb('webhook').$type<{
    enabled?: boolean;
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    triggerOn?: string;
    secret?: string;
  }>(),
  labels: jsonb('labels').$type<string[]>().default([]),
  disabled: boolean('disabled').default(false),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('workflow_suites_org_name_unique').on(t.orgId, t.name),
  index('workflow_suites_org_id_idx').on(t.orgId),
]);

// Backward-compat alias
export const workflowSuites = outcomeGroups;

// ---------------------------------------------------------------------------
// Categories — hierarchical taxonomy for policies and outcomes
// ---------------------------------------------------------------------------
export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => categories.id),
  entityType: text('entity_type').default('all').$type<'all' | 'policy' | 'workflow'>(),
  color: text('color'),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('categories_org_parent_idx').on(t.orgId, t.parentId),
  index('categories_org_entity_type_idx').on(t.orgId, t.entityType),
  uniqueIndex('categories_org_slug_parent_unique').on(t.orgId, t.slug, t.parentId),
]);

// ---------------------------------------------------------------------------
// Policies — knowledge base documents (unstructured markdown)
// ---------------------------------------------------------------------------
export type PolicyStatus = 'draft' | 'active' | 'archived';

export const policies = pgTable('policies', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  categoryId: uuid('category_id').references(() => categories.id),
  tags: jsonb('tags').$type<string[]>().default([]),
  status: text('status').default('draft').$type<PolicyStatus>(),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('policies_org_id_idx').on(t.orgId),
  index('policies_org_category_idx').on(t.orgId, t.categoryId),
  index('policies_org_status_idx').on(t.orgId, t.status),
]);

// ---------------------------------------------------------------------------
// Policy Versions — full content snapshots for version history
// ---------------------------------------------------------------------------
export const policyVersions = pgTable('policy_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  policyId: uuid('policy_id').notNull().references(() => policies.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  changedBy: text('changed_by'),
  changeNote: text('change_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('policy_versions_policy_version_unique').on(t.policyId, t.version),
]);

// ---------------------------------------------------------------------------
// Outcome Types — named business outcome / journey (was: workflows)
// ---------------------------------------------------------------------------
export const outcomeTypes = pgTable('outcome_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  suiteId: uuid('suite_id').references(() => outcomeGroups.id),
  sourcePolicyId: uuid('source_policy_id').references(() => policies.id),
  categoryId: uuid('category_id').references(() => categories.id),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').default('operational'), // legacy text column — use categoryId for new code
  tags: jsonb('tags').$type<string[]>().default([]),
  labels: jsonb('labels').$type<string[]>().default([]),

  // Expected event types this outcome should produce
  expectedEventTypes: jsonb('expected_event_types').$type<string[]>().default([]),

  // Boundary configuration — where Lamdis visibility ends
  boundaryConfig: jsonb('boundary_config').$type<{
    boundaries?: string[]; // decision_boundary IDs
    notes?: string;
  }>(),

  // Timeout: how long to keep an instance open waiting for events (ms)
  timeoutMs: integer('timeout_ms').default(1800000), // 30 min default

  // Synthetic script for CI/simulated execution
  syntheticScript: jsonb('synthetic_script').$type<{
    assistantId?: string;
    connectionKey?: string;
    environmentId?: string;
    personaId?: string;
    objective?: string;
    preSteps?: unknown[];
    steps?: unknown[];
    variables?: unknown[];
    iterate?: boolean;
    maxTurns?: number;
    minTurns?: number;
    continueAfterPass?: boolean;
    judgeConfig?: unknown;
  }>(),

  // Webhook configuration
  webhook: jsonb('webhook').$type<{
    enabled?: boolean;
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    triggerOn?: 'all' | 'any_failure' | 'status_change' | 'completed';
    includeEvents?: boolean;
    secret?: string;
  }>(),
  webhookSecondary: jsonb('webhook_secondary').$type<{
    enabled?: boolean;
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    triggerOn?: 'all' | 'any_failure' | 'status_change' | 'completed';
    includeEvents?: boolean;
    secret?: string;
  }>(),

  // Storage & vault configuration
  storageMode: text('storage_mode').default('standard'), // 'standard' | 'vault' | 'customer_owned'
  vault: jsonb('vault').$type<{
    retentionDays?: number;
    storeEvents?: boolean;
    immutable?: boolean;
  }>(),

  // --- New outcome-specific columns ---
  successCriteria: jsonb('success_criteria').$type<Array<{ description: string; weight?: number }>>().default([]),
  keyDecisions: jsonb('key_decisions').$type<Array<{ name: string; description?: string; automatable?: boolean }>>().default([]),
  automationBoundaries: jsonb('automation_boundaries').$type<{
    maxAutoApproveRisk?: string;
    requireHumanAbove?: number;
    allowedAutoActions?: string[];
  }>().default({}),
  connectedSystems: jsonb('connected_systems').$type<Array<{ systemId: string; role?: string }>>().default([]),
  riskClass: text('risk_class').default('standard'), // 'low' | 'standard' | 'high' | 'critical'

  // Agent configuration — default settings for the autonomous agent loop
  agentConfig: jsonb('agent_config').$type<{
    planningModel?: string;         // Bedrock model ID override for planning
    maxConcurrentActions?: number;  // max actions running in parallel
    tickIntervalMs?: number;        // override default 30s tick
    maxPlanSteps?: number;          // guard against runaway plans
    allowedActionCategories?: string[];
  }>(),

  // Default playbook for instances created from this outcome type. The
  // orchestrator will use this when an instance has no activePlaybookId set.
  // FK is kept loose (text comment) to avoid circular import with playbooks.ts.
  defaultPlaybookId: uuid('default_playbook_id'),

  disabled: boolean('disabled').default(false),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('outcome_types_org_name_unique').on(t.orgId, t.name),
  index('outcome_types_org_id_idx').on(t.orgId),
  index('workflows_suite_id_idx').on(t.suiteId),
  index('workflows_org_category_idx').on(t.orgId, t.category),
]);

// Backward-compat alias
export const workflows = outcomeTypes;

// ---------------------------------------------------------------------------
// Proof Expectations — what must be true for an outcome (was: policy_checks)
// ---------------------------------------------------------------------------
export type ConfirmationLevel = 'A' | 'B' | 'C' | 'D' | 'E';
export type CheckType =
  | 'judge'
  | 'includes'
  | 'regex'
  | 'json_path'
  | 'event_presence'
  | 'event_sequence'
  | 'timing'
  | 'confirmation_level'
  | 'playbook_document_present';
export type CheckCategory = 'compliance' | 'safety' | 'quality' | 'security' | 'operational' | 'custom';
export type CheckSeverity = 'critical' | 'error' | 'warning' | 'info';

/**
 * Scope of a proof expectation. Determines which ref column is populated and
 * which instances the rule evaluates against:
 *  - 'global'       → applies to every instance in the org (all ref cols null)
 *  - 'outcome_type' → applies to instances of one outcomeType (legacy default)
 *  - 'playbook'     → applies only when a specific playbook is active
 *  - 'category'     → applies to any outcomeType tagged with the category
 *
 * Enforced by `proof_expectations_scope_check` in migration 0013.
 */
export type ProofExpectationScope = 'global' | 'outcome_type' | 'playbook' | 'category';

export const proofExpectations = pgTable('proof_expectations', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  // Nullable post-migration 0013 — null for global / playbook / category scopes.
  outcomeTypeId: uuid('outcome_type_id').references(() => outcomeTypes.id, { onDelete: 'cascade' }),
  // Loose FK to outcome_playbooks (defined in playbooks.ts) to avoid circular
  // import. Populated when scope='playbook'.
  playbookId: uuid('playbook_id'),
  scope: text('scope').notNull().default('outcome_type').$type<ProofExpectationScope>(),
  categoryId: uuid('category_id').references(() => categories.id),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').default('compliance').$type<CheckCategory>(), // legacy text column — use categoryId for new code
  severity: text('severity').default('error').$type<CheckSeverity>(),

  checkType: text('check_type').notNull().$type<CheckType>(),

  config: jsonb('config').$type<Record<string, unknown>>().default({}),

  requiredEvidenceLevel: text('required_evidence_level').default('A').$type<ConfirmationLevel>(),

  judgeThreshold: doublePrecision('judge_threshold').default(0.75),

  onPass: jsonb('on_pass').$type<Array<{ type: string; config?: unknown }>>().default([]),
  onFail: jsonb('on_fail').$type<Array<{ type: string; config?: unknown }>>().default([]),

  appliesTo: jsonb('applies_to').$type<{
    environments?: string[];
    eventTypes?: string[];
  }>(),

  // --- New proof-specific columns ---
  riskClass: text('risk_class').default('standard'),
  proofThreshold: doublePrecision('proof_threshold').default(0.8),
  autoApprove: boolean('auto_approve').default(false),

  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('proof_expectations_org_id_idx').on(t.orgId),
  index('proof_expectations_outcome_type_id_idx').on(t.outcomeTypeId),
  index('policy_checks_org_category_idx').on(t.orgId, t.category),
]);

// Backward-compat alias
export const policyChecks = proofExpectations;

// ---------------------------------------------------------------------------
// Evidence Events — discrete runtime facts (the core event store)
// ---------------------------------------------------------------------------
export const evidenceEvents = pgTable('evidence_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),

  // The distributed correlation ID — links this event to an outcome instance
  outcomeInstanceId: uuid('outcome_instance_id').notNull(),

  eventType: text('event_type').notNull(),
  eventSource: text('event_source').notNull(),
  sourceServiceId: text('source_service_id'),

  payload: jsonb('payload').notNull(),

  confirmationLevel: text('confirmation_level').$type<ConfirmationLevel>(),

  parentEventId: uuid('parent_event_id'),

  idempotencyKey: text('idempotency_key'),

  sequenceNumber: integer('sequence_number'),

  emittedAt: timestamp('emitted_at', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),

  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
}, (t) => [
  index('evidence_events_instance_id_idx').on(t.outcomeInstanceId),
  index('evidence_events_org_instance_idx').on(t.orgId, t.outcomeInstanceId),
  index('evidence_events_org_type_idx').on(t.orgId, t.eventType),
  index('evidence_events_org_received_idx').on(t.orgId, t.receivedAt),
  uniqueIndex('evidence_events_idempotency_key_unique').on(t.idempotencyKey),
  index('evidence_events_instance_seq_idx').on(t.outcomeInstanceId, t.sequenceNumber),
]);

// ---------------------------------------------------------------------------
// Outcome Instances — one execution of an outcome (was: workflow_instances)
// The id IS the distributed correlation ID (UUIDv7)
// ---------------------------------------------------------------------------
export interface CheckResult {
  checkId: string;
  checkName?: string;
  status: 'passed' | 'failed' | 'skipped' | 'error' | 'pending';
  score?: number;
  reasoning?: string;
  evidenceLevel?: string;
  evaluatedAt?: string;
  latencyMs?: number;
}

export const outcomeInstances = pgTable('outcome_instances', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  outcomeTypeId: uuid('outcome_type_id').references(() => outcomeTypes.id),

  environment: text('environment').default('production'),
  trigger: text('trigger').default('sdk'),

  status: text('status').default('open'),

  highestConfirmationLevel: text('highest_confirmation_level').$type<ConfirmationLevel>(),

  eventCount: integer('event_count').default(0),
  firstEventAt: timestamp('first_event_at', { withTimezone: true }),
  lastEventAt: timestamp('last_event_at', { withTimezone: true }),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),

  runId: uuid('run_id'),

  checkResults: jsonb('check_results').$type<CheckResult[]>().default([]),

  totals: jsonb('totals').$type<{
    passed: number;
    failed: number;
    skipped: number;
    error: number;
  }>(),

  transcript: jsonb('transcript').$type<unknown[]>(),

  gitContext: jsonb('git_context').$type<{
    provider?: string;
    repo?: string;
    branch?: string;
    commit?: string;
    prNumber?: number;
    prTitle?: string;
  }>(),

  reviewStatus: text('review_status'),
  review: jsonb('review').$type<{
    required?: boolean;
    status?: string;
    reviewedBy?: string;
    reviewedAt?: string;
    notes?: string;
  }>(),
  comments: jsonb('comments').$type<Array<{
    id: string;
    text: string;
    authorSub: string;
    authorEmail?: string;
    authorName?: string;
    createdAt: string;
    updatedAt?: string;
    edited?: boolean;
  }>>(),
  statusHistory: jsonb('status_history').$type<Array<{
    previousStatus?: string;
    newStatus: string;
    changedBy: string;
    changedByEmail?: string;
    changedByName?: string;
    reason?: string;
    changedAt: string;
  }>>(),

  // Storage & vault (inherited from outcome type or overridden)
  storageMode: text('storage_mode'), // 'standard' | 'vault' | 'customer_owned'
  vault: jsonb('vault').$type<{
    traceHash?: string;
    immutable?: boolean;
    deleteAfter?: string;
    archived?: boolean;
  }>(),
  tracePointer: jsonb('trace_pointer').$type<{
    provider?: string;
    bucket?: string;
    key?: string;
    region?: string;
  }>(),

  // --- New outcome-instance columns ---
  confidenceScore: doublePrecision('confidence_score'),
  proofStatus: text('proof_status').default('gathering'), // 'gathering' | 'partial' | 'sufficient' | 'complete'
  nextLikelyAction: jsonb('next_likely_action').$type<{ actionId?: string; name?: string; confidence?: number }>(),
  automationMode: text('automation_mode').default('manual'), // 'manual' | 'assisted' | 'auto' | 'waiting'
  escalationReason: text('escalation_reason'),
  stalledSince: timestamp('stalled_since', { withTimezone: true }),

  // Agent loop state
  agentEnabled: boolean('agent_enabled').default(false),
  agentStatus: text('agent_status').default('idle'), // 'idle' | 'planning' | 'executing' | 'waiting_input' | 'paused' | 'completed' | 'failed'
  currentPlan: jsonb('current_plan').$type<{
    taskCount?: number;
    completedCount?: number;
    nextStep?: string;
    lastUpdated?: string;
  }>(),
  goalDescription: text('goal_description'),
  guidelines: jsonb('guidelines').$type<Record<string, unknown>>(),
  currentFacts: jsonb('current_facts').$type<Record<string, {
    value: any;
    previousValues?: Array<{ value: any; changedAt: string }>;
    updatedAt: string;
    source: string;
  }>>().default({}),
  userContact: jsonb('user_contact').$type<{
    phone?: string;
    email?: string;
    pushEnabled?: boolean;
  }>(),

  tags: jsonb('tags').$type<string[]>().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),

  // Outcome Playbook linkage — the customer-specific recipe this instance
  // is executing. Loaded by the orchestrator each tick. Loose FK to avoid
  // circular import with playbooks.ts.
  activePlaybookId: uuid('active_playbook_id'),
  playbookVersion: integer('playbook_version'),

  // AOS: workspace linkage
  workspaceId: uuid('workspace_id'), // FK to workspaces (set by app)

  // AOS: cross-objective coordination
  parentObjectiveId: uuid('parent_objective_id'), // self-reference for sub-objectives
  relatedObjectiveIds: jsonb('related_objective_ids').$type<string[]>().default([]),

  // AOS: self-scheduling config
  schedulingConfig: jsonb('scheduling_config').$type<{
    intervalMs?: number;
    adaptiveMode?: boolean;
    minIntervalMs?: number;
    maxIntervalMs?: number;
    cronExpression?: string;
  }>(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('outcome_instances_org_id_idx').on(t.orgId),
  index('workflow_instances_workflow_id_idx').on(t.outcomeTypeId),
  index('outcome_instances_org_status_idx').on(t.orgId, t.status),
  index('workflow_instances_org_env_idx').on(t.orgId, t.environment),
  index('workflow_instances_run_id_idx').on(t.runId),
  index('workflow_instances_org_created_idx').on(t.orgId, t.createdAt),
  index('workflow_instances_org_review_status_idx').on(t.orgId, t.reviewStatus),
]);

// Backward-compat alias
export const workflowInstances = outcomeInstances;

// ---------------------------------------------------------------------------
// Runs — unified batch execution model
// ---------------------------------------------------------------------------
export const runs = pgTable('runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  outcomeGroupId: uuid('outcome_group_id').references(() => outcomeGroups.id),

  trigger: text('trigger').default('manual'),
  environment: text('environment').default('ci'),

  gitContext: jsonb('git_context').$type<{
    provider?: string;
    repo?: string;
    branch?: string;
    commit?: string;
    prNumber?: number;
    prTitle?: string;
  }>(),

  status: text('status').default('queued'),

  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),

  totals: jsonb('totals').$type<{
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    error: number;
  }>(),
  summaryScore: doublePrecision('summary_score'),
  progress: jsonb('progress').$type<{
    completed: number;
    total: number;
    currentWorkflow?: string;
  }>(),

  instanceIds: jsonb('instance_ids').$type<string[]>().default([]),

  webhookUrl: text('webhook_url'),

  error: jsonb('error').$type<{ message?: string; stack?: string }>(),

  stopRequested: boolean('stop_requested').default(false),

  // --- New run column ---
  mode: text('mode').default('live'), // 'live' | 'dry_run' | 'replay'

  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('runs_org_id_idx').on(t.orgId),
  index('runs_suite_id_idx').on(t.outcomeGroupId),
  index('runs_org_status_idx').on(t.orgId, t.status),
  index('runs_org_created_idx').on(t.orgId, t.createdAt),
]);

// ---------------------------------------------------------------------------
// Decision Boundaries — where Lamdis visibility ends (was: boundary_definitions)
// ---------------------------------------------------------------------------
export const decisionBoundaries = pgTable('decision_boundaries', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  boundaryType: text('boundary_type').default('service'),
  detectionMethod: text('detection_method').default('manual'),
  serviceIdentifiers: jsonb('service_identifiers').$type<string[]>().default([]),
  eventTypes: jsonb('event_types').$type<string[]>().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),

  // --- New boundary columns ---
  riskLevel: text('risk_level').default('medium'), // 'low' | 'medium' | 'high' | 'critical'
  autoExecute: boolean('auto_execute').default(false),
  escalationPolicy: jsonb('escalation_policy').$type<{
    escalateTo?: string;
    timeoutMs?: number;
    notifyChannels?: string[];
  }>(),
  requiresHumanApproval: boolean('requires_human_approval').default(true),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('boundary_definitions_org_id_idx').on(t.orgId),
]);

// Backward-compat alias
export const boundaryDefinitions = decisionBoundaries;

// ---------------------------------------------------------------------------
// Analysis Jobs — intelligence meter (policy imports, code analysis, etc.)
// ---------------------------------------------------------------------------
export type AnalysisJobType = 'policy_import' | 'code_analysis' | 'workflow_mapping' | 'instrumentation' | 'reanalysis';

export const analysisJobs = pgTable('analysis_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  type: text('type').notNull().$type<AnalysisJobType>(),
  status: text('status').default('pending'), // pending, running, completed, failed
  inputSummary: jsonb('input_summary').$type<Record<string, unknown>>(),
  result: jsonb('result').$type<Record<string, unknown>>(),
  error: jsonb('error').$type<{ message?: string }>(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('analysis_jobs_org_id_idx').on(t.orgId),
  index('analysis_jobs_org_created_idx').on(t.orgId, t.createdAt),
  index('analysis_jobs_org_type_idx').on(t.orgId, t.type),
]);

// ---------------------------------------------------------------------------
// Environments — keep from old model, still useful
// ---------------------------------------------------------------------------
export const environments = pgTable('environments', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  key: text('key'),
  name: text('name').notNull(),
  description: text('description'),
  orgWide: boolean('org_wide').default(true),
  enabled: boolean('enabled').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('environments_org_key_unique').on(t.orgId, t.key),
  index('environments_org_id_idx').on(t.orgId),
]);
