import { pgTable, text, uuid, timestamp, jsonb, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { connectorInstances } from './connectors';

// ---------------------------------------------------------------------------
// Document Templates — references to a customer's actual document templates
// stored in their connected systems (Google Drive folder, Salesforce template,
// DocuSign envelope, etc.). Used by playbooks to declare required documents.
// ---------------------------------------------------------------------------
export const documentTemplates = pgTable('document_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  key: text('key').notNull(), // 'state_license', 'npi_verification'
  name: text('name').notNull(),
  description: text('description'),
  sourceConnectorInstanceId: uuid('source_connector_instance_id').references(() => connectorInstances.id),
  sourcePath: text('source_path'), // file id, folder path, template id within the connector
  schema: jsonb('schema').$type<Record<string, unknown>>().default({}),
  version: integer('version').default(1),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('document_templates_org_id_idx').on(t.orgId),
  uniqueIndex('document_templates_org_key_unique').on(t.orgId, t.key),
]);
