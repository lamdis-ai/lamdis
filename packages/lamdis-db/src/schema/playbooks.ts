import { pgTable, text, uuid, timestamp, jsonb, integer, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { outcomeTypes } from './interactions';
import { approvalChains } from './approvals';
import { connectorInstances } from './connectors';
import { documentTemplates } from './documentTemplates';

// ---------------------------------------------------------------------------
// Outcome Playbooks — per-(org, outcomeType) versioned recipe that aligns
// the outcome to a customer's actual systems, approvers, documents, and
// procedure. The orchestrator loads the active playbook for each instance
// and constrains the agent to operate within it.
// ---------------------------------------------------------------------------
export type PlaybookSource = 'chat' | 'wizard' | 'import' | 'observed';
export type PlaybookStatus = 'draft' | 'active' | 'archived';

export type PlaybookProcedureStep = {
  id: string;
  sequence: number;
  title: string;
  description?: string;
  // Capability key the step expects (e.g. 'read_doc'); orchestrator resolves
  // it via system_bindings to a connector instance + dynamic tool.
  capability?: string;
  // Reference to a binding role (e.g. 'document_store') the step uses.
  bindingRole?: string;
  requiresApproval?: boolean;
  approvalChainId?: string;
  successCriteria?: string[];
  expectedDocuments?: string[]; // documentTemplate keys
  timeoutMins?: number;
};

export const outcomePlaybooks = pgTable('outcome_playbooks', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  outcomeTypeId: uuid('outcome_type_id').notNull().references(() => outcomeTypes.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('draft').$type<PlaybookStatus>(),
  name: text('name').notNull(),
  summary: text('summary'),
  source: text('source').notNull().default('wizard').$type<PlaybookSource>(),
  procedureSteps: jsonb('procedure_steps').$type<PlaybookProcedureStep[]>().default([]),
  approvalChainId: uuid('approval_chain_id').references(() => approvalChains.id),
  // Free-form structured guidelines from discovery (e.g., escalation contacts,
  // tone, special handling) that get summarized into the planner prompt.
  guidelines: jsonb('guidelines').$type<Record<string, unknown>>().default({}),
  createdBy: text('created_by'),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('outcome_playbooks_org_id_idx').on(t.orgId),
  index('outcome_playbooks_outcome_type_idx').on(t.outcomeTypeId),
  uniqueIndex('outcome_playbooks_outcome_version_unique').on(t.outcomeTypeId, t.version),
  index('outcome_playbooks_org_status_idx').on(t.orgId, t.status),
]);

// ---------------------------------------------------------------------------
// Playbook System Bindings — map a binding role (document_store,
// approver_directory, evidence_archive, notification, signature, ...) to
// either a typed connector instance or, as a fallback, a dynamic tool.
// ---------------------------------------------------------------------------
export type PlaybookBindingRole =
  | 'document_store'
  | 'approver_directory'
  | 'evidence_archive'
  | 'notification'
  | 'signature'
  | 'crm'
  | 'fax'
  | 'custom';

export const playbookSystemBindings = pgTable('playbook_system_bindings', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  playbookId: uuid('playbook_id').notNull().references(() => outcomePlaybooks.id, { onDelete: 'cascade' }),
  role: text('role').notNull().$type<PlaybookBindingRole>(),
  connectorInstanceId: uuid('connector_instance_id').references(() => connectorInstances.id),
  dynamicToolId: uuid('dynamic_tool_id'), // FK kept loose to avoid circular import
  config: jsonb('config').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('playbook_system_bindings_playbook_idx').on(t.playbookId),
  index('playbook_system_bindings_org_idx').on(t.orgId),
]);

// ---------------------------------------------------------------------------
// Playbook Document Requirements — declares which document templates must be
// satisfied for an instance to complete. Each becomes an implicit proof
// expectation at runtime.
// ---------------------------------------------------------------------------
export const playbookDocumentRequirements = pgTable('playbook_document_requirements', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  playbookId: uuid('playbook_id').notNull().references(() => outcomePlaybooks.id, { onDelete: 'cascade' }),
  documentTemplateId: uuid('document_template_id').notNull().references(() => documentTemplates.id),
  required: boolean('required').default(true),
  whenCondition: jsonb('when_condition').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('playbook_document_requirements_playbook_idx').on(t.playbookId),
]);
