import { pgTable, text, uuid, timestamp, integer, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// ---------------------------------------------------------------------------
// Workspaces — persistent code directories per objective
// ---------------------------------------------------------------------------
export const workspaces = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  outcomeInstanceId: uuid('outcome_instance_id'),
  name: text('name').notNull(),
  status: text('status').default('active'), // 'active' | 'archived'
  rootPath: text('root_path').notNull(), // absolute path on host
  sizeBytes: integer('size_bytes').default(0),
  deployedServices: jsonb('deployed_services').$type<Array<{
    name: string;
    command: string;
    pid?: number;
    port?: number;
    healthUrl?: string;
    status: 'running' | 'stopped' | 'error';
    startedAt?: string;
  }>>().default([]),
  envVars: jsonb('env_vars').$type<Record<string, string>>().default({}),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  lastExecAt: timestamp('last_exec_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('workspaces_org_id_idx').on(t.orgId),
  index('workspaces_outcome_instance_idx').on(t.outcomeInstanceId),
  index('workspaces_org_status_idx').on(t.orgId, t.status),
]);

// ---------------------------------------------------------------------------
// Workspace Files — index of tracked files (actual files live on disk)
// ---------------------------------------------------------------------------
export const workspaceFiles = pgTable('workspace_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  path: text('path').notNull(), // relative to workspace root
  contentHash: text('content_hash'), // SHA-256 of file content
  sizeBytes: integer('size_bytes').default(0),
  mimeType: text('mime_type'),
  createdBy: text('created_by'), // 'agent' | userSub
  version: integer('version').default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('workspace_files_workspace_idx').on(t.workspaceId),
  uniqueIndex('workspace_files_workspace_path_unique').on(t.workspaceId, t.path),
]);
