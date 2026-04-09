-- Agent Operating System Foundation
-- New tables: workspaces, workspace_files, dynamic_tools, agent_identities,
--   credential_vault_entries, credential_requests, message_threads, messages, agent_schedules
-- Extended tables: agent_tasks, channels, outcome_instances

-- ============================================================================
-- New Tables
-- ============================================================================

-- Workspaces — persistent code directories per objective
CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "outcome_instance_id" uuid,
  "name" text NOT NULL,
  "status" text DEFAULT 'active',
  "root_path" text NOT NULL,
  "size_bytes" integer DEFAULT 0,
  "deployed_services" jsonb DEFAULT '[]'::jsonb,
  "env_vars" jsonb DEFAULT '{}'::jsonb,
  "last_activity_at" timestamp with time zone,
  "last_exec_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "workspaces_org_id_idx" ON "workspaces" ("org_id");
CREATE INDEX IF NOT EXISTS "workspaces_outcome_instance_idx" ON "workspaces" ("outcome_instance_id");
CREATE INDEX IF NOT EXISTS "workspaces_org_status_idx" ON "workspaces" ("org_id", "status");

-- Workspace Files — index of tracked files
CREATE TABLE IF NOT EXISTS "workspace_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "path" text NOT NULL,
  "content_hash" text,
  "size_bytes" integer DEFAULT 0,
  "mime_type" text,
  "created_by" text,
  "version" integer DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "workspace_files_workspace_idx" ON "workspace_files" ("workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_files_workspace_path_unique" ON "workspace_files" ("workspace_id", "path");

-- Dynamic Tools — agent-created integrations
CREATE TABLE IF NOT EXISTS "dynamic_tools" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "workspace_id" uuid,
  "outcome_instance_id" uuid,
  "tool_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "version" text DEFAULT '1.0.0',
  "scope" text DEFAULT 'org',
  "source_type" text DEFAULT 'generated',
  "input_schema" jsonb DEFAULT '{}'::jsonb,
  "output_schema" jsonb DEFAULT '{}'::jsonb,
  "implementation" jsonb,
  "test_results" jsonb DEFAULT '[]'::jsonb,
  "status" text DEFAULT 'draft',
  "api_docs_url" text,
  "source_search_query" text,
  "reuse_count" integer DEFAULT 0,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "dynamic_tools_org_id_idx" ON "dynamic_tools" ("org_id");
CREATE UNIQUE INDEX IF NOT EXISTS "dynamic_tools_org_tool_id_unique" ON "dynamic_tools" ("org_id", "tool_id");
CREATE INDEX IF NOT EXISTS "dynamic_tools_org_scope_idx" ON "dynamic_tools" ("org_id", "scope");
CREATE INDEX IF NOT EXISTS "dynamic_tools_org_status_idx" ON "dynamic_tools" ("org_id", "status");
CREATE INDEX IF NOT EXISTS "dynamic_tools_workspace_idx" ON "dynamic_tools" ("workspace_id");

-- Agent Identities — executors with their own credentials and capabilities
CREATE TABLE IF NOT EXISTS "agent_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "identity_type" text NOT NULL DEFAULT 'system_agent',
  "delegate_for_user_sub" text,
  "capabilities" jsonb DEFAULT '[]'::jsonb,
  "credential_policy" text DEFAULT 'own',
  "status" text DEFAULT 'active',
  "last_active_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_identities_org_id_idx" ON "agent_identities" ("org_id");
CREATE INDEX IF NOT EXISTS "agent_identities_org_type_idx" ON "agent_identities" ("org_id", "identity_type");

-- Credential Vault Entries — encrypted credentials
CREATE TABLE IF NOT EXISTS "credential_vault_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "identity_id" uuid REFERENCES "agent_identities"("id"),
  "owner_type" text NOT NULL DEFAULT 'org',
  "owner_ref" text,
  "provider" text NOT NULL,
  "credential_type" text NOT NULL DEFAULT 'api_key',
  "label" text,
  "ciphertext" text NOT NULL,
  "iv" text NOT NULL,
  "tag" text NOT NULL,
  "expires_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "last_rotated_at" timestamp with time zone,
  "status" text DEFAULT 'active',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "credential_vault_org_id_idx" ON "credential_vault_entries" ("org_id");
CREATE INDEX IF NOT EXISTS "credential_vault_org_provider_idx" ON "credential_vault_entries" ("org_id", "provider");
CREATE INDEX IF NOT EXISTS "credential_vault_identity_idx" ON "credential_vault_entries" ("identity_id");
CREATE INDEX IF NOT EXISTS "credential_vault_org_owner_idx" ON "credential_vault_entries" ("org_id", "owner_type", "owner_ref");

-- Credential Requests — agent asks human to provide credentials
CREATE TABLE IF NOT EXISTS "credential_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "outcome_instance_id" uuid,
  "identity_id" uuid REFERENCES "agent_identities"("id"),
  "provider" text NOT NULL,
  "credential_type" text NOT NULL DEFAULT 'api_key',
  "reason" text,
  "fields_needed" jsonb DEFAULT '[]'::jsonb,
  "status" text DEFAULT 'pending',
  "responded_by" text,
  "responded_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "credential_requests_org_id_idx" ON "credential_requests" ("org_id");
CREATE INDEX IF NOT EXISTS "credential_requests_org_status_idx" ON "credential_requests" ("org_id", "status");
CREATE INDEX IF NOT EXISTS "credential_requests_instance_idx" ON "credential_requests" ("outcome_instance_id");

-- Message Threads — conversation threads per objective per channel
CREATE TABLE IF NOT EXISTS "message_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "outcome_instance_id" uuid,
  "channel_id" uuid REFERENCES "channels"("id"),
  "external_participant_id" text,
  "external_participant_name" text,
  "direction" text DEFAULT 'bidirectional',
  "status" text DEFAULT 'active',
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "last_message_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "message_threads_org_id_idx" ON "message_threads" ("org_id");
CREATE INDEX IF NOT EXISTS "message_threads_instance_idx" ON "message_threads" ("outcome_instance_id");
CREATE INDEX IF NOT EXISTS "message_threads_channel_idx" ON "message_threads" ("channel_id");
CREATE INDEX IF NOT EXISTS "message_threads_org_participant_idx" ON "message_threads" ("org_id", "external_participant_id");

-- Messages — individual messages in threads
CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "thread_id" uuid NOT NULL REFERENCES "message_threads"("id") ON DELETE CASCADE,
  "direction" text NOT NULL,
  "sender_type" text NOT NULL DEFAULT 'agent',
  "sender_ref" text,
  "content_type" text DEFAULT 'text',
  "content" text,
  "media_attachments" jsonb DEFAULT '[]'::jsonb,
  "external_message_id" text,
  "delivery_status" text DEFAULT 'queued',
  "delivery_error" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "messages_thread_idx" ON "messages" ("thread_id");
CREATE INDEX IF NOT EXISTS "messages_thread_created_idx" ON "messages" ("thread_id", "created_at");
CREATE INDEX IF NOT EXISTS "messages_external_id_idx" ON "messages" ("external_message_id");

-- Agent Schedules — per-instance adaptive scheduling
CREATE TABLE IF NOT EXISTS "agent_schedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "outcome_instance_id" uuid NOT NULL,
  "schedule_type" text NOT NULL DEFAULT 'polling',
  "interval_ms" integer DEFAULT 30000,
  "cron_expression" text,
  "adaptive_config" jsonb,
  "enabled" boolean DEFAULT true,
  "last_run_at" timestamp with time zone,
  "next_run_at" timestamp with time zone,
  "consecutive_no_ops" integer DEFAULT 0,
  "last_run_result" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_schedules_org_id_idx" ON "agent_schedules" ("org_id");
CREATE INDEX IF NOT EXISTS "agent_schedules_instance_idx" ON "agent_schedules" ("outcome_instance_id");
CREATE INDEX IF NOT EXISTS "agent_schedules_next_run_idx" ON "agent_schedules" ("next_run_at");
CREATE INDEX IF NOT EXISTS "agent_schedules_enabled_next_idx" ON "agent_schedules" ("enabled", "next_run_at");

-- ============================================================================
-- Extend Existing Tables
-- ============================================================================

-- agent_tasks: add assignee, evidence, review columns
ALTER TABLE "agent_tasks" ADD COLUMN IF NOT EXISTS "assignee_type" text DEFAULT 'agent';
ALTER TABLE "agent_tasks" ADD COLUMN IF NOT EXISTS "assignee_ref" text;
ALTER TABLE "agent_tasks" ADD COLUMN IF NOT EXISTS "evidence_attachments" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "agent_tasks" ADD COLUMN IF NOT EXISTS "review_result" jsonb;

-- channels: add communication hub columns
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "channel_medium" text;
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "provider_config" jsonb;
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "inbound_routing_rules" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "credential_vault_entry_id" uuid;

-- outcome_instances: add workspace, coordination, scheduling columns
ALTER TABLE "outcome_instances" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
ALTER TABLE "outcome_instances" ADD COLUMN IF NOT EXISTS "parent_objective_id" uuid;
ALTER TABLE "outcome_instances" ADD COLUMN IF NOT EXISTS "related_objective_ids" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "outcome_instances" ADD COLUMN IF NOT EXISTS "scheduling_config" jsonb;
