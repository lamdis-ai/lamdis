import { pgTable, text, uuid, timestamp, integer, boolean, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const agents = pgTable('agents', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  agentId: text('agent_id').notNull(), // slug per org
  name: text('name').notNull(),
  description: text('description'),
  mode: text('mode').default('a2a'), // 'mcp','a2a'
  manifest: jsonb('manifest').$type<{ slug?: string; version?: string }>(),
  allowedActions: jsonb('allowed_actions').$type<string[]>().default([]),
  allowedProviders: jsonb('allowed_providers').$type<string[]>().default([]),
  allowedKnowledgeCategories: jsonb('allowed_knowledge_categories').$type<string[]>().default([]),
  allowedKnowledgeIds: jsonb('allowed_knowledge_ids').$type<string[]>().default([]),
  visibility: text('visibility').default('org'), // 'org','internal','external','private'
  externalSlug: text('external_slug'),
  externalPublishedAt: timestamp('external_published_at', { withTimezone: true }),
  allowedConsumers: jsonb('allowed_consumers').$type<{
    type?: string;
    orgSlugs?: string[];
    domains?: string[];
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('agents_org_agent_id_unique').on(t.orgId, t.agentId),
  index('agents_org_id_idx').on(t.orgId),
  index('agents_visibility_idx').on(t.visibility),
  index('agents_external_slug_idx').on(t.externalSlug),
]);

export const assistants = pgTable('assistants', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  requestId: text('request_id'),
  connectionKey: text('connection_key'),
  version: text('version').default('v1'),
  labels: jsonb('labels').$type<string[]>().default([]),
  chatInputSchema: jsonb('chat_input_schema'),
  chatOutputSchema: jsonb('chat_output_schema'),
  responseFieldPath: text('response_field_path').default('reply'),
  protocol: text('protocol').default('http_chat'), // 'http_chat','sse','websocket'
  timeoutMs: integer('timeout_ms').default(60000),
  sseConfig: jsonb('sse_config').$type<{
    contentPath?: string;
    finishPath?: string;
    finishValue?: string;
  }>(),
  websocketConfig: jsonb('websocket_config').$type<{
    messageFormat?: string;
    messageField?: string;
    contentPath?: string;
    finishPath?: string;
    finishValue?: string;
    protocols?: string[];
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('assistants_org_key_version_unique').on(t.orgId, t.key, t.version),
  index('assistants_org_id_idx').on(t.orgId),
]);

export const personas = pgTable('personas', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  yaml: text('yaml').notNull(),
  variables: jsonb('variables'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('personas_org_name_unique').on(t.orgId, t.name),
  index('personas_org_id_idx').on(t.orgId),
]);

export const mockAssistants = pgTable('mock_assistants', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  persona: text('persona').notNull(),
  chatInputSchema: jsonb('chat_input_schema'),
  chatOutputSchema: jsonb('chat_output_schema'),
  responseFieldPath: text('response_field_path').default('reply'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('mock_assistants_org_name_unique').on(t.orgId, t.name),
  index('mock_assistants_org_id_idx').on(t.orgId),
]);
