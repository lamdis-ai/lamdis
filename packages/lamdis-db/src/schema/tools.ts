import { pgTable, text, uuid, timestamp, integer, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

// ---------------------------------------------------------------------------
// Dynamic Tools — agent-created integrations, reusable across objectives
// ---------------------------------------------------------------------------
export const dynamicTools = pgTable('dynamic_tools', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  workspaceId: uuid('workspace_id'), // FK set by app, nullable for non-workspace tools
  outcomeInstanceId: uuid('outcome_instance_id'), // nullable, for objective-scoped tools
  toolId: text('tool_id').notNull(), // unique slug per org
  name: text('name').notNull(),
  description: text('description'),
  version: text('version').default('1.0.0'),
  scope: text('scope').default('org'), // 'org' | 'objective' | 'workspace'
  sourceType: text('source_type').default('generated'), // 'generated' | 'imported' | 'manual'
  inputSchema: jsonb('input_schema').$type<Record<string, unknown>>().default({}),
  outputSchema: jsonb('output_schema').$type<Record<string, unknown>>().default({}),
  implementation: jsonb('implementation').$type<{
    type: 'hosted_js' | 'http' | 'docker_service' | 'workspace_script';
    code?: string;
    entrypoint?: string;
    httpConfig?: {
      method: string;
      baseUrl: string;
      path: string;
      headers?: Record<string, string>;
      auth?: Record<string, unknown>;
    };
    dockerConfig?: {
      image: string;
      command?: string;
      port?: number;
    };
    workspaceRef?: {
      workspaceId: string;
      scriptPath: string;
    };
    permissions?: {
      net_allow?: string[];
      env?: string[];
      fs?: string[];
    };
  }>(),
  testResults: jsonb('test_results').$type<Array<{
    input: Record<string, unknown>;
    expected?: unknown;
    actual?: unknown;
    passed: boolean;
    testedAt: string;
  }>>().default([]),
  status: text('status').default('draft'), // 'draft' | 'testing' | 'active' | 'disabled' | 'failed'
  apiDocsUrl: text('api_docs_url'),
  sourceSearchQuery: text('source_search_query'),
  reuseCount: integer('reuse_count').default(0),
  createdBy: text('created_by'), // 'agent' | userSub
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('dynamic_tools_org_id_idx').on(t.orgId),
  uniqueIndex('dynamic_tools_org_tool_id_unique').on(t.orgId, t.toolId),
  index('dynamic_tools_org_scope_idx').on(t.orgId, t.scope),
  index('dynamic_tools_org_status_idx').on(t.orgId, t.status),
  index('dynamic_tools_workspace_idx').on(t.workspaceId),
]);
