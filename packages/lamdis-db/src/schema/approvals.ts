import { pgTable, text, uuid, timestamp, jsonb, integer, index, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// ---------------------------------------------------------------------------
// Approver Roles — named roles whose members can be statically listed or
// resolved dynamically from a system binding (e.g. a Salesforce group).
// ---------------------------------------------------------------------------
export type ApproverMember =
  | { type: 'user'; userSub: string; email?: string; name?: string }
  | { type: 'group'; groupKey: string; name?: string };

export const approverRoles = pgTable('approver_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  key: text('key').notNull(), // 'credentialing_director'
  displayName: text('display_name').notNull(),
  description: text('description'),
  members: jsonb('members').$type<ApproverMember[]>().default([]),
  fallbackRoleId: uuid('fallback_role_id').references((): AnyPgColumn => approverRoles.id),
  // If set, members are resolved at runtime through this playbook system binding.
  sourceBindingId: uuid('source_binding_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('approver_roles_org_key_unique').on(t.orgId, t.key),
  index('approver_roles_org_id_idx').on(t.orgId),
]);

// ---------------------------------------------------------------------------
// Approval Chains — ordered list of steps. Each step references an approver
// role and may run serially or in parallel with a parallelMode of
// 'unanimous' (default), 'quorum', or 'first_responder'.
// ---------------------------------------------------------------------------
export type ApprovalChainStep = {
  roleId: string;
  mode: 'serial' | 'parallel';
  parallelMode?: 'unanimous' | 'quorum' | 'first_responder';
  quorumCount?: number;
  escalationAfterMins?: number;
  fallbackRoleId?: string;
  notes?: string;
};

export const approvalChains = pgTable('approval_chains', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  steps: jsonb('steps').$type<ApprovalChainStep[]>().default([]),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('approval_chains_org_id_idx').on(t.orgId),
  uniqueIndex('approval_chains_org_name_unique').on(t.orgId, t.name),
]);

// ---------------------------------------------------------------------------
// Approval Chain Runs — runtime state of an in-flight approval chain
// ---------------------------------------------------------------------------
export const approvalChainRuns = pgTable('approval_chain_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  chainId: uuid('chain_id').notNull().references(() => approvalChains.id),
  outcomeInstanceId: uuid('outcome_instance_id'),
  actionExecutionId: uuid('action_execution_id'),
  currentStepIndex: integer('current_step_index').default(0),
  status: text('status').default('pending'), // 'pending' | 'in_progress' | 'approved' | 'rejected' | 'escalated' | 'cancelled'
  stepState: jsonb('step_state').$type<Array<{
    stepIndex: number;
    status: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'escalated';
    decisions: Array<{ userSub: string; decision: 'approved' | 'rejected'; at: string; notes?: string }>;
    inputRequestIds: string[];
    startedAt?: string;
    completedAt?: string;
  }>>().default([]),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('approval_chain_runs_org_id_idx').on(t.orgId),
  index('approval_chain_runs_instance_idx').on(t.outcomeInstanceId),
  index('approval_chain_runs_chain_idx').on(t.chainId),
]);
