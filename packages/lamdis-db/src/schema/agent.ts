import { pgTable, text, uuid, timestamp, integer, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { actions } from './actions';

// ---------------------------------------------------------------------------
// Input Requests — structured requests from agent to user
// ---------------------------------------------------------------------------
export const inputRequests = pgTable('input_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  outcomeInstanceId: uuid('outcome_instance_id').notNull(),
  agentTaskId: uuid('agent_task_id'), // FK set after agentTasks defined (circular)
  requestType: text('request_type').notNull(), // 'credentials' | 'images' | 'text' | 'choice' | 'approval' | 'file'
  title: text('title').notNull(),
  description: text('description'),
  schema: jsonb('schema').$type<Record<string, unknown>>().default({}), // expected fields, options, constraints
  status: text('status').default('pending'), // 'pending' | 'fulfilled' | 'expired' | 'cancelled'
  priority: text('priority').default('normal'), // 'low' | 'normal' | 'high' | 'urgent'
  // Approval-chain context — when this input request is part of an approval
  // chain, these fields tie it back to the chain run + role + step. Loose FKs
  // to avoid circular imports with approvals.ts.
  approvalChainRunId: uuid('approval_chain_run_id'),
  chainStepIndex: integer('chain_step_index'),
  approverRoleId: uuid('approver_role_id'),
  response: jsonb('response').$type<Record<string, unknown>>(),
  respondedBy: text('responded_by'),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('input_requests_org_id_idx').on(t.orgId),
  index('input_requests_instance_idx').on(t.outcomeInstanceId),
  index('input_requests_org_status_idx').on(t.orgId, t.status),
]);

// ---------------------------------------------------------------------------
// Agent Tasks — planned steps in an outcome's execution plan
// ---------------------------------------------------------------------------
export const agentTasks = pgTable('agent_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  outcomeInstanceId: uuid('outcome_instance_id').notNull(),
  parentTaskId: uuid('parent_task_id'), // self-reference for sub-tasks
  sequence: integer('sequence').notNull().default(0),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('planned'), // 'planned' | 'ready' | 'in_progress' | 'blocked' | 'completed' | 'failed' | 'skipped'
  taskType: text('task_type').notNull(), // 'action' | 'input_request' | 'evaluation' | 'planning' | 'wait'
  actionId: uuid('action_id').references(() => actions.id),
  actionInput: jsonb('action_input').$type<Record<string, unknown>>(),
  actionOutput: jsonb('action_output').$type<Record<string, unknown>>(),
  inputRequestId: uuid('input_request_id').references(() => inputRequests.id),
  blockedReason: text('blocked_reason'),
  dependsOn: jsonb('depends_on').$type<string[]>().default([]),
  retryCount: integer('retry_count').default(0),
  maxRetries: integer('max_retries').default(2),

  // AOS: task assignment
  assigneeType: text('assignee_type').default('agent'), // 'agent' | 'user' | 'external'
  assigneeRef: text('assignee_ref'), // userSub or external identifier

  // AOS: structured evidence attachments
  evidenceAttachments: jsonb('evidence_attachments').$type<Array<{
    type: 'image' | 'audio' | 'video' | 'document' | 'screenshot' | 'log';
    storageKey: string;
    mimeType: string;
    fileName?: string;
    sizeBytes?: number;
    uploadedAt: string;
    uploadedBy: string;
    llmReviewResult?: {
      verified: boolean;
      reasoning: string;
      confidence: number;
      reviewedAt: string;
    };
  }>>().default([]),

  // AOS: LLM or human review of task completion
  reviewResult: jsonb('review_result').$type<{
    reviewedBy: 'llm' | 'human';
    reviewerRef?: string;
    status: 'verified' | 'rejected' | 'needs_more_evidence';
    reasoning: string;
    confidence?: number;
    reviewedAt: string;
  }>(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('agent_tasks_org_id_idx').on(t.orgId),
  index('agent_tasks_instance_idx').on(t.outcomeInstanceId),
  index('agent_tasks_instance_status_idx').on(t.outcomeInstanceId, t.status),
  index('agent_tasks_parent_idx').on(t.parentTaskId),
]);

// ---------------------------------------------------------------------------
// Agent Activity Log — fine-grained live feed for the UI
// ---------------------------------------------------------------------------
export const agentActivityLog = pgTable('agent_activity_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  outcomeInstanceId: uuid('outcome_instance_id').notNull(),
  agentTaskId: uuid('agent_task_id').references(() => agentTasks.id),
  activityType: text('activity_type').notNull(), // 'thinking' | 'planning' | 'executing' | 'waiting' | 'observing' | 'replanning' | 'requesting_input' | 'completed' | 'error'
  summary: text('summary').notNull(),
  details: jsonb('details').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('agent_activity_log_instance_idx').on(t.outcomeInstanceId),
  index('agent_activity_log_instance_created_idx').on(t.outcomeInstanceId, t.createdAt),
]);
