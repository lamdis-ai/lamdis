import { pgTable, text, uuid, timestamp, boolean, integer, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const actions = pgTable('actions', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  actionId: text('action_id').notNull(), // slug/key per org
  title: text('title').notNull(),
  description: text('description'),
  method: text('method').default('GET'), // GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS
  path: text('path').default(''),
  headers: jsonb('headers'),
  body: jsonb('body'),
  tags: jsonb('tags').$type<string[]>().default([]),
  transport: jsonb('transport').$type<{
    mode?: string;
    authority?: string;
    http?: unknown;
  }>(),
  http: jsonb('http'), // legacy
  inputSchema: jsonb('input_schema'),
  inputSchemaDescription: text('input_schema_description'),
  outputSchema: jsonb('output_schema'),
  outputSchemaDescription: text('output_schema_description'),
  auth: jsonb('auth'),
  risk: jsonb('risk'),
  rateLimit: jsonb('rate_limit'),
  serviceArea: jsonb('service_area'),
  staticResponse: jsonb('static_response').$type<{
    content?: string;
    content_type?: string;
    status?: number;
    headers?: Record<string, string>;
  }>(),
  isMock: boolean('is_mock').default(false),
  knowledgeRef: jsonb('knowledge_ref').$type<{ id?: string }>(),
  workflowRef: jsonb('workflow_ref').$type<{ id?: string; mode?: string }>(),
  hosted: jsonb('hosted').$type<{
    runtime?: string;
    code?: string;
    timeout_ms?: number;
    permissions?: { net_allow?: string[]; env?: string[] };
  }>(),
  enabled: boolean('enabled').default(true),
  version: text('version'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('actions_org_action_id_unique').on(t.orgId, t.actionId),
  index('actions_org_id_idx').on(t.orgId),
]);

export const actionBindings = pgTable('action_bindings', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  actionId: text('action_id').notNull(),
  environmentId: uuid('environment_id').notNull(),
  connectionId: uuid('connection_id'),
  // Direct FK to connector_instances. Set when this binding talks to a typed
  // connector. Used by the playbook enforcement gate to check that the
  // connector is bound to the active playbook before executing. Loose FK
  // (no .references()) to avoid a circular import with connectors.ts.
  connectorInstanceId: uuid('connector_instance_id'),
  auth: jsonb('auth').$type<{
    type?: string;
    tokenVariableKey?: string;
    usernameVariableKey?: string;
    passwordVariableKey?: string;
    connectionKey?: string;
    headerName?: string;
    tokenPrefix?: string;
    customHeaders?: Record<string, string>;
  }>(),
  baseUrl: text('base_url').notNull(),
  headers: jsonb('headers'),
  defaultInputs: jsonb('default_inputs'),
  timeoutMs: integer('timeout_ms'),
  enabled: boolean('enabled').default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('action_bindings_org_action_env_unique').on(t.orgId, t.actionId, t.environmentId),
  index('action_bindings_org_id_idx').on(t.orgId),
  index('action_bindings_action_id_idx').on(t.actionId),
  index('action_bindings_environment_id_idx').on(t.environmentId),
]);

export const actionTemplates = pgTable('action_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  provider: text('provider').notNull(),
  logoS3Key: text('logo_s3_key'),
  category: text('category'),
  inputSchema: jsonb('input_schema'),
  inputSchemaDescription: text('input_schema_description'),
  outputSchema: jsonb('output_schema'),
  outputSchemaDescription: text('output_schema_description'),
  http: jsonb('http'),
  transport: jsonb('transport'),
  staticResponse: jsonb('static_response'),
  status: text('status').default('pending'), // 'pending','active','rejected'
  submittedByOrgId: uuid('submitted_by_org_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('action_templates_provider_idx').on(t.provider),
  index('action_templates_category_idx').on(t.category),
  index('action_templates_status_idx').on(t.status),
]);

export const providerTemplates = pgTable('provider_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  authorizeUrl: text('authorize_url').notNull(),
  tokenUrl: text('token_url').notNull(),
  scopes: text('scopes').default(''),
  docsUrl: text('docs_url'),
  logoS3Key: text('logo_s3_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const requestTemplates = pgTable('request_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  provider: text('provider'),
  logoS3Key: text('logo_s3_key'),
  category: text('category'),
  inputSchema: jsonb('input_schema'),
  inputSchemaDescription: text('input_schema_description'),
  outputSchema: jsonb('output_schema'),
  outputSchemaDescription: text('output_schema_description'),
  transport: jsonb('transport'),
  http: jsonb('http'),
  staticResponse: jsonb('static_response'),
  status: text('status').default('active'), // 'pending','active','rejected'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('request_templates_provider_idx').on(t.provider),
  index('request_templates_category_idx').on(t.category),
  index('request_templates_status_idx').on(t.status),
]);

export const actionPacks = pgTable('action_packs', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').default(''),
  category: text('category').default('industry'), // 'core','industry','custom'
  industry: text('industry'),
  tags: jsonb('tags').$type<string[]>(),
  version: text('version').default('1.0.0'),
  status: text('status').default('active'), // 'active','inactive','draft'
  visibility: text('visibility').default('public'), // 'public','private','unlisted'
  ownerOrgId: uuid('owner_org_id'),
  actions: jsonb('actions').$type<Array<{
    key: string;
    templateKey?: string;
    required?: boolean;
    displayOrder?: number;
    notes?: string;
  }>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('action_packs_category_industry_idx').on(t.category, t.industry),
  index('action_packs_visibility_status_idx').on(t.visibility, t.status),
]);
