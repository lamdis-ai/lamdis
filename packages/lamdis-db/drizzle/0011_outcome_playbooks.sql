-- Outcome Playbooks
-- New tables: connector_types, connector_instances, approver_roles,
--   approval_chains, approval_chain_runs, document_templates,
--   outcome_playbooks, playbook_system_bindings, playbook_document_requirements
-- Extended tables: outcome_types (default_playbook_id),
--   outcome_instances (active_playbook_id, playbook_version),
--   input_requests (approval_chain_run_id, chain_step_index, approver_role_id),
--   connection_health (connector_instance_id)

-- ============================================================================
-- Connectors
-- ============================================================================

CREATE TABLE IF NOT EXISTS "connector_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "display_name" text NOT NULL,
  "description" text,
  "category" text DEFAULT 'integration',
  "capabilities" jsonb DEFAULT '[]'::jsonb,
  "config_schema" jsonb DEFAULT '{}'::jsonb,
  "auth_flow" text DEFAULT 'api_key',
  "enabled" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "connector_types_key_unique" ON "connector_types" ("key");

CREATE TABLE IF NOT EXISTS "connector_instances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "connector_type_id" uuid NOT NULL REFERENCES "connector_types"("id"),
  "name" text NOT NULL,
  "description" text,
  "config" jsonb DEFAULT '{}'::jsonb,
  "credential_vault_entry_id" uuid REFERENCES "credential_vault_entries"("id"),
  "scope" text DEFAULT 'org',
  "scope_ref" text,
  "status" text DEFAULT 'active',
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "connector_instances_org_id_idx" ON "connector_instances" ("org_id");
CREATE INDEX IF NOT EXISTS "connector_instances_org_type_idx" ON "connector_instances" ("org_id", "connector_type_id");
CREATE UNIQUE INDEX IF NOT EXISTS "connector_instances_org_name_unique" ON "connector_instances" ("org_id", "name");

-- ============================================================================
-- Approvals
-- ============================================================================

CREATE TABLE IF NOT EXISTS "approver_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "key" text NOT NULL,
  "display_name" text NOT NULL,
  "description" text,
  "members" jsonb DEFAULT '[]'::jsonb,
  "fallback_role_id" uuid REFERENCES "approver_roles"("id"),
  "source_binding_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "approver_roles_org_key_unique" ON "approver_roles" ("org_id", "key");
CREATE INDEX IF NOT EXISTS "approver_roles_org_id_idx" ON "approver_roles" ("org_id");

CREATE TABLE IF NOT EXISTS "approval_chains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "description" text,
  "steps" jsonb DEFAULT '[]'::jsonb,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "approval_chains_org_id_idx" ON "approval_chains" ("org_id");
CREATE UNIQUE INDEX IF NOT EXISTS "approval_chains_org_name_unique" ON "approval_chains" ("org_id", "name");

CREATE TABLE IF NOT EXISTS "approval_chain_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "chain_id" uuid NOT NULL REFERENCES "approval_chains"("id"),
  "outcome_instance_id" uuid,
  "action_execution_id" uuid,
  "current_step_index" integer DEFAULT 0,
  "status" text DEFAULT 'pending',
  "step_state" jsonb DEFAULT '[]'::jsonb,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "approval_chain_runs_org_id_idx" ON "approval_chain_runs" ("org_id");
CREATE INDEX IF NOT EXISTS "approval_chain_runs_instance_idx" ON "approval_chain_runs" ("outcome_instance_id");
CREATE INDEX IF NOT EXISTS "approval_chain_runs_chain_idx" ON "approval_chain_runs" ("chain_id");

-- ============================================================================
-- Document Templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS "document_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "key" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "source_connector_instance_id" uuid REFERENCES "connector_instances"("id"),
  "source_path" text,
  "schema" jsonb DEFAULT '{}'::jsonb,
  "version" integer DEFAULT 1,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "document_templates_org_id_idx" ON "document_templates" ("org_id");
CREATE UNIQUE INDEX IF NOT EXISTS "document_templates_org_key_unique" ON "document_templates" ("org_id", "key");

-- ============================================================================
-- Outcome Playbooks
-- ============================================================================

CREATE TABLE IF NOT EXISTS "outcome_playbooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "outcome_type_id" uuid NOT NULL REFERENCES "outcome_types"("id") ON DELETE CASCADE,
  "version" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'draft',
  "name" text NOT NULL,
  "summary" text,
  "source" text NOT NULL DEFAULT 'wizard',
  "procedure_steps" jsonb DEFAULT '[]'::jsonb,
  "approval_chain_id" uuid REFERENCES "approval_chains"("id"),
  "guidelines" jsonb DEFAULT '{}'::jsonb,
  "created_by" text,
  "activated_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "outcome_playbooks_org_id_idx" ON "outcome_playbooks" ("org_id");
CREATE INDEX IF NOT EXISTS "outcome_playbooks_outcome_type_idx" ON "outcome_playbooks" ("outcome_type_id");
CREATE UNIQUE INDEX IF NOT EXISTS "outcome_playbooks_outcome_version_unique" ON "outcome_playbooks" ("outcome_type_id", "version");
CREATE INDEX IF NOT EXISTS "outcome_playbooks_org_status_idx" ON "outcome_playbooks" ("org_id", "status");

CREATE TABLE IF NOT EXISTS "playbook_system_bindings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "playbook_id" uuid NOT NULL REFERENCES "outcome_playbooks"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "connector_instance_id" uuid REFERENCES "connector_instances"("id"),
  "dynamic_tool_id" uuid,
  "config" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "playbook_system_bindings_playbook_idx" ON "playbook_system_bindings" ("playbook_id");
CREATE INDEX IF NOT EXISTS "playbook_system_bindings_org_idx" ON "playbook_system_bindings" ("org_id");

CREATE TABLE IF NOT EXISTS "playbook_document_requirements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "playbook_id" uuid NOT NULL REFERENCES "outcome_playbooks"("id") ON DELETE CASCADE,
  "document_template_id" uuid NOT NULL REFERENCES "document_templates"("id"),
  "required" boolean DEFAULT true,
  "when_condition" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "playbook_document_requirements_playbook_idx" ON "playbook_document_requirements" ("playbook_id");

-- ============================================================================
-- Extend existing tables
-- ============================================================================

ALTER TABLE "outcome_types" ADD COLUMN IF NOT EXISTS "default_playbook_id" uuid;

ALTER TABLE "outcome_instances" ADD COLUMN IF NOT EXISTS "active_playbook_id" uuid;
ALTER TABLE "outcome_instances" ADD COLUMN IF NOT EXISTS "playbook_version" integer;
CREATE INDEX IF NOT EXISTS "outcome_instances_active_playbook_idx" ON "outcome_instances" ("active_playbook_id");

ALTER TABLE "input_requests" ADD COLUMN IF NOT EXISTS "approval_chain_run_id" uuid;
ALTER TABLE "input_requests" ADD COLUMN IF NOT EXISTS "chain_step_index" integer;
ALTER TABLE "input_requests" ADD COLUMN IF NOT EXISTS "approver_role_id" uuid;
CREATE INDEX IF NOT EXISTS "input_requests_chain_run_idx" ON "input_requests" ("approval_chain_run_id");

ALTER TABLE "connection_health" ADD COLUMN IF NOT EXISTS "connector_instance_id" uuid;
CREATE INDEX IF NOT EXISTS "connection_health_connector_instance_idx" ON "connection_health" ("connector_instance_id");

-- ============================================================================
-- Seed connector_types
-- ============================================================================

INSERT INTO "connector_types" ("key", "display_name", "description", "category", "capabilities", "auth_flow")
VALUES
  ('google_drive', 'Google Drive', 'Google Workspace document store', 'document_store',
   '["read_doc","write_doc","archive_evidence"]'::jsonb, 'oauth2'),
  ('salesforce', 'Salesforce', 'Salesforce CRM records and groups', 'crm',
   '["lookup_record","update_record","list_users","list_groups"]'::jsonb, 'oauth2'),
  ('slack', 'Slack', 'Slack messaging and notifications', 'messaging',
   '["send_message","list_users"]'::jsonb, 'oauth2'),
  ('docusign', 'DocuSign', 'Digital signature workflows', 'signature',
   '["request_signature","read_doc"]'::jsonb, 'oauth2'),
  ('fax_http', 'HTTP Fax Gateway', 'Send faxes via an HTTP fax provider', 'fax',
   '["send_fax"]'::jsonb, 'api_key'),
  ('generic_http', 'Generic HTTP', 'Fallback HTTP-based integration', 'integration',
   '["http_call"]'::jsonb, 'api_key')
ON CONFLICT ("key") DO NOTHING;
