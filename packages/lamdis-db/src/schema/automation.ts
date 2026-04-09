import { pgTable, text, uuid, timestamp, integer, boolean, jsonb, doublePrecision, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { actions } from './actions';
import { outcomeTypes } from './interactions';

// ---------------------------------------------------------------------------
// Action Executions — what Lamdis DID (or proposed to do)
// ---------------------------------------------------------------------------
export const actionExecutions = pgTable('action_executions', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  outcomeInstanceId: uuid('outcome_instance_id'),
  actionId: uuid('action_id').references(() => actions.id),
  proposedBy: text('proposed_by').default('system'),
  evidenceSnapshot: jsonb('evidence_snapshot'),
  proofThresholdMet: boolean('proof_threshold_met').default(false),
  riskClass: text('risk_class').default('standard'),
  status: text('status').default('proposed'), // 'proposed' | 'executing' | 'completed' | 'blocked' | 'failed' | 'approved'
  blockedReason: text('blocked_reason'),
  approval: jsonb('approval').$type<{
    approvedBy?: string;
    approvedAt?: string;
    method?: string;
    notes?: string;
  }>(),
  executionLog: jsonb('execution_log').$type<{
    steps?: Array<{ step: string; status: string; at: string; details?: unknown }>;
    result?: unknown;
    error?: string;
  }>(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('action_executions_org_id_idx').on(t.orgId),
  index('action_executions_org_status_idx').on(t.orgId, t.status),
  index('action_executions_instance_idx').on(t.outcomeInstanceId),
]);

// ---------------------------------------------------------------------------
// Decision Dossiers — WHY Lamdis decided something
// ---------------------------------------------------------------------------
export const decisionDossiers = pgTable('decision_dossiers', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  outcomeInstanceId: uuid('outcome_instance_id'),
  actionExecutionId: uuid('action_execution_id').references(() => actionExecutions.id),
  decisionType: text('decision_type').notNull(), // 'proof_evaluation' | 'action_proposed' | 'action_blocked' | 'escalation' | 'auto_executed'
  summary: text('summary'),
  factsConsidered: jsonb('facts_considered').$type<Array<{ fact: string; source?: string; weight?: number }>>().default([]),
  evidenceIds: jsonb('evidence_ids').$type<string[]>().default([]),
  proofChain: jsonb('proof_chain').$type<Array<{ expectationId: string; met: boolean; confidence: number; reasoning?: string }>>().default([]),
  confidenceScore: doublePrecision('confidence_score'),
  riskAssessment: jsonb('risk_assessment').$type<{
    level?: string;
    factors?: string[];
    mitigations?: string[];
  }>(),
  boundaryApplied: jsonb('boundary_applied').$type<{
    boundaryId?: string;
    name?: string;
    decision?: string;
    reason?: string;
  }>(),
  actor: text('actor').default('system'), // 'system' | 'human' | user sub
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('decision_dossiers_org_id_idx').on(t.orgId),
  index('decision_dossiers_org_created_idx').on(t.orgId, t.createdAt),
  index('decision_dossiers_instance_idx').on(t.outcomeInstanceId),
]);

// ---------------------------------------------------------------------------
// Connection Health — tracks health of connected external systems
// ---------------------------------------------------------------------------
export const connectionHealth = pgTable('connection_health', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  connectorInstallationId: uuid('connector_installation_id'),
  connectorInstanceId: uuid('connector_instance_id'), // FK loose to avoid circular import
  connectionKey: text('connection_key'),
  category: text('category').default('event_source'), // 'event_source' | 'action_tool' | 'knowledge_source'
  authStatus: text('auth_status').default('healthy'), // 'healthy' | 'degraded' | 'expired' | 'error'
  eventVolume24h: integer('event_volume_24h').default(0),
  recentFailures: integer('recent_failures').default(0),
  lastHealthCheck: timestamp('last_health_check', { withTimezone: true }),
  lastFailureReason: text('last_failure_reason'),
  domainsTouched: jsonb('domains_touched').$type<string[]>().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('connection_health_org_id_idx').on(t.orgId),
]);

// ---------------------------------------------------------------------------
// Channels — deployable chat endpoints with auth, permissions, and objectives
// ---------------------------------------------------------------------------
export const channels = pgTable('channels', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  channelType: text('channel_type').notNull().default('customer'), // 'customer' | 'employee' | 'system'
  authMethod: text('auth_method').notNull().default('email_verification'),
  authConfig: jsonb('auth_config').$type<Record<string, unknown>>().default({}),
  linkedObjectiveIds: jsonb('linked_objective_ids').$type<string[]>().default([]),
  permissions: jsonb('permissions').$type<string[]>().default(['provide_evidence', 'view_own_status']),
  multimodal: jsonb('multimodal').$type<{ images?: boolean; audio?: boolean; video?: boolean; files?: boolean }>().default({}),
  deploymentKey: text('deployment_key').notNull(),
  enabled: boolean('enabled').default(true),

  // AOS: communication hub extensions
  channelMedium: text('channel_medium'), // 'sms' | 'voice' | 'whatsapp' | 'email' | 'chat' | 'webhook' | 'api'
  providerConfig: jsonb('provider_config').$type<{
    provider?: string; // 'twilio' | 'smtp' | 'sendgrid' | 'webhook'
    accountSid?: string;
    fromNumber?: string;
    smtpHost?: string;
    smtpPort?: number;
    webhookUrl?: string;
    apiEndpoint?: string;
  }>(),
  inboundRoutingRules: jsonb('inbound_routing_rules').$type<Array<{
    match: string; // pattern to match (phone number, email, keyword)
    routeToInstanceId: string;
  }>>().default([]),
  credentialVaultEntryId: uuid('credential_vault_entry_id'), // FK to credential_vault_entries (set by app)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('channels_org_id_idx').on(t.orgId),
  index('channels_deployment_key_idx').on(t.deploymentKey),
]);

// ---------------------------------------------------------------------------
// Evaluation Schedules — CRON-like timers for continuous objective evaluation
// ---------------------------------------------------------------------------
export const evaluationSchedules = pgTable('evaluation_schedules', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  objectiveTypeId: uuid('objective_type_id').notNull().references(() => outcomeTypes.id, { onDelete: 'cascade' }),
  intervalMinutes: integer('interval_minutes').notNull().default(60),
  enabled: boolean('enabled').default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  lastRunResult: jsonb('last_run_result').$type<{
    instancesEvaluated: number;
    proofsUpdated: number;
    actionsProposed: number;
    errors: number;
    durationMs: number;
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('evaluation_schedules_org_id_idx').on(t.orgId),
  uniqueIndex('evaluation_schedules_org_objective_unique').on(t.orgId, t.objectiveTypeId),
  index('evaluation_schedules_next_run_idx').on(t.nextRunAt),
]);

// ---------------------------------------------------------------------------
// Conversation Sessions — links chat sessions to outcome instances
// ---------------------------------------------------------------------------
export const conversationSessions = pgTable('conversation_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  channelId: uuid('channel_id').references(() => channels.id),
  outcomeInstanceId: uuid('outcome_instance_id'),
  channel: text('channel').notNull().default('chat'), // 'chat' | 'email' | 'voice' | 'webhook'
  externalSessionId: text('external_session_id'),
  participantId: text('participant_id'),
  participantType: text('participant_type').default('customer'), // 'customer' | 'agent' | 'system'
  status: text('status').default('active'), // 'active' | 'paused' | 'closed'
  context: jsonb('context').$type<Record<string, unknown>>().default({}),
  authTokenHash: text('auth_token_hash'),
  allowedScopes: jsonb('allowed_scopes').$type<string[]>().default(['read_own', 'provide_evidence']),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('conversation_sessions_org_id_idx').on(t.orgId),
  index('conversation_sessions_instance_idx').on(t.outcomeInstanceId),
  index('conversation_sessions_external_idx').on(t.orgId, t.externalSessionId),
]);
