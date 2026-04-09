-- Enable pgvector extension for knowledge embeddings
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "action_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"action_id" text NOT NULL,
	"environment_id" uuid NOT NULL,
	"connection_id" uuid,
	"auth" jsonb,
	"base_url" text NOT NULL,
	"headers" jsonb,
	"default_inputs" jsonb,
	"timeout_ms" integer,
	"enabled" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '',
	"category" text DEFAULT 'industry',
	"industry" text,
	"tags" jsonb,
	"version" text DEFAULT '1.0.0',
	"status" text DEFAULT 'active',
	"visibility" text DEFAULT 'public',
	"owner_org_id" uuid,
	"actions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_packs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "action_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"provider" text NOT NULL,
	"logo_s3_key" text,
	"category" text,
	"input_schema" jsonb,
	"input_schema_description" text,
	"output_schema" jsonb,
	"output_schema_description" text,
	"http" jsonb,
	"transport" jsonb,
	"static_response" jsonb,
	"status" text DEFAULT 'pending',
	"submitted_by_org_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_templates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"action_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"method" text DEFAULT 'GET',
	"path" text DEFAULT '',
	"headers" jsonb,
	"body" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"transport" jsonb,
	"http" jsonb,
	"input_schema" jsonb,
	"input_schema_description" text,
	"output_schema" jsonb,
	"output_schema_description" text,
	"auth" jsonb,
	"risk" jsonb,
	"rate_limit" jsonb,
	"service_area" jsonb,
	"static_response" jsonb,
	"is_mock" boolean DEFAULT false,
	"knowledge_ref" jsonb,
	"workflow_ref" jsonb,
	"hosted" jsonb,
	"enabled" boolean DEFAULT true,
	"version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"authorize_url" text NOT NULL,
	"token_url" text NOT NULL,
	"scopes" text DEFAULT '',
	"docs_url" text,
	"logo_s3_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_templates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "request_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"provider" text,
	"logo_s3_key" text,
	"category" text,
	"input_schema" jsonb,
	"input_schema_description" text,
	"output_schema" jsonb,
	"output_schema_description" text,
	"transport" jsonb,
	"http" jsonb,
	"static_response" jsonb,
	"status" text DEFAULT 'active',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_templates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"mode" text DEFAULT 'a2a',
	"manifest" jsonb,
	"allowed_actions" jsonb DEFAULT '[]'::jsonb,
	"allowed_providers" jsonb DEFAULT '[]'::jsonb,
	"allowed_knowledge_categories" jsonb DEFAULT '[]'::jsonb,
	"allowed_knowledge_ids" jsonb DEFAULT '[]'::jsonb,
	"visibility" text DEFAULT 'org',
	"external_slug" text,
	"external_published_at" timestamp with time zone,
	"allowed_consumers" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"request_id" text,
	"connection_key" text,
	"version" text DEFAULT 'v1',
	"labels" jsonb DEFAULT '[]'::jsonb,
	"chat_input_schema" jsonb,
	"chat_output_schema" jsonb,
	"response_field_path" text DEFAULT 'reply',
	"protocol" text DEFAULT 'http_chat',
	"timeout_ms" integer DEFAULT 60000,
	"sse_config" jsonb,
	"websocket_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mock_assistants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"persona" text NOT NULL,
	"chat_input_schema" jsonb,
	"chat_output_schema" jsonb,
	"response_field_path" text DEFAULT 'reply',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"yaml" text NOT NULL,
	"variables" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assurance_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"evidence_model_id" text NOT NULL,
	"vault_entry_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"correlation_id" text,
	"session_id" text,
	"status" text NOT NULL,
	"totals" jsonb,
	"results" jsonb DEFAULT '[]'::jsonb,
	"trace" jsonb,
	"webhooks_fired" jsonb DEFAULT '[]'::jsonb,
	"received_at" timestamp with time zone DEFAULT now(),
	"evaluated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"processing_ms" integer,
	"evaluated_by" text,
	"vault" jsonb,
	"storage_mode" text DEFAULT 'lamdis_hosted',
	"trace_pointer" jsonb,
	"submitted_trace_hash_sha256" text,
	"derived_evidence" jsonb,
	"review_status" text DEFAULT 'pending_review',
	"comments" jsonb,
	"status_history" jsonb,
	"review" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assurance_suites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"mode" text DEFAULT 'api',
	"webhook" jsonb,
	"webhook_secondary" jsonb,
	"thresholds" jsonb,
	"vault" jsonb,
	"labels" jsonb DEFAULT '[]'::jsonb,
	"created_by" text,
	"disabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assurance_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"evidence_model_id" text,
	"suite_id" text,
	"suite_ids" jsonb DEFAULT '[]'::jsonb,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'compliance',
	"assertions" jsonb DEFAULT '[]'::jsonb,
	"on_pass" jsonb DEFAULT '[]'::jsonb,
	"on_fail" jsonb DEFAULT '[]'::jsonb,
	"filter" jsonb,
	"judge_threshold" double precision DEFAULT 0.75,
	"labels" jsonb DEFAULT '[]'::jsonb,
	"disabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"key_hash" text NOT NULL,
	"key_salt" text,
	"key_prefix" text NOT NULL,
	"role_id" uuid,
	"role_slug" text,
	"permissions" jsonb,
	"scopes" jsonb DEFAULT '["assurance:*"]'::jsonb,
	"allowed_ips" jsonb,
	"allowed_origins" jsonb,
	"rate_limit" integer,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"usage_count" integer DEFAULT 0,
	"status" text DEFAULT 'active',
	"disabled" boolean DEFAULT false,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"revoke_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "join_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"org_id" uuid NOT NULL,
	"auth0_org_id" text NOT NULL,
	"invitation_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer,
	"use_count" integer DEFAULT 0,
	"created_by" text NOT NULL,
	"role" text DEFAULT 'member',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "join_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_sub" text NOT NULL,
	"provider" text NOT NULL,
	"state" text NOT NULL,
	"code_verifier" text NOT NULL,
	"redirect_to" text DEFAULT '/dashboard/test',
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_states_state_unique" UNIQUE("state")
);
--> statement-breakpoint
CREATE TABLE "user_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_sub" text NOT NULL,
	"provider" text NOT NULL,
	"enc" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_sub" text NOT NULL,
	"email" text,
	"display_name" text,
	"employee_uuid" text,
	"avatar_url" text,
	"preferences" jsonb DEFAULT '{"timezone":"UTC","dateFormat":"YYYY-MM-DD","theme":"dark","emailNotifications":true}'::jsonb,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_sub_unique" UNIQUE("user_sub")
);
--> statement-breakpoint
CREATE TABLE "connector_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"connector_id" uuid NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"tokens" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending',
	"submitted_by_org_id" uuid,
	"oauth" jsonb,
	"config_schema" jsonb,
	"actions" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connectors_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "domain_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_claims_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "export_caches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"semver" text NOT NULL,
	"format" text NOT NULL,
	"content" text NOT NULL,
	"digest_sha256" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_variables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"tag" text NOT NULL,
	"created_by" text,
	"updated_by" text,
	"revealed_at" timestamp with time zone,
	"reveal_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor" jsonb,
	"action" text NOT NULL,
	"category" text,
	"severity" text,
	"resource" jsonb,
	"before" jsonb,
	"after" jsonb,
	"changed_fields" jsonb,
	"details" jsonb,
	"metadata" jsonb,
	"compliance" jsonb,
	"integrity_hash" text,
	"previous_hash" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"artifact_key" text,
	"artifact_provider" text,
	"actor_sub" text NOT NULL,
	"actor_email" text,
	"actor_name" text,
	"action" text NOT NULL,
	"jit_ttl_seconds" integer,
	"jit_expires_at" timestamp with time zone,
	"failure_reason" text,
	"user_agent" text,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"data_schema" jsonb,
	"examples" jsonb,
	"webhook" jsonb,
	"vault" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_by" text,
	"disabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_vault_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"evidence_model_id" text NOT NULL,
	"data" jsonb,
	"storage_mode" text DEFAULT 'lamdis_hosted',
	"artifact_pointer" jsonb,
	"submitted_data_hash_sha256" text,
	"derived_evidence" jsonb,
	"reasoning_summary" text,
	"status" text DEFAULT 'received',
	"validation" jsonb,
	"processing" jsonb,
	"overall_result" text DEFAULT 'pending',
	"test_summary" jsonb,
	"test_results" jsonb,
	"evaluated_at" timestamp with time zone,
	"source" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"flagged_for_review" boolean DEFAULT false,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"review_notes" text,
	"archived" boolean DEFAULT false,
	"archived_at" timestamp with time zone,
	"scheduled_deletion_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"domain" text,
	"auth0_org_id" text,
	"auth0_org_name" text,
	"profile" jsonb DEFAULT '{}'::jsonb,
	"verification" jsonb,
	"domains" jsonb DEFAULT '[]'::jsonb,
	"stripe_customer_id" text,
	"subscription_status" text DEFAULT 'none',
	"current_plan" text DEFAULT 'runs_free',
	"assurance_plan" text DEFAULT 'assurance_free',
	"assurance_subscription_status" text DEFAULT 'none',
	"seats" integer DEFAULT 1,
	"runs_seat_allocation" jsonb DEFAULT '{"builders":0,"reviewers":0,"viewers":-1}'::jsonb,
	"assurance_seat_allocation" jsonb DEFAULT '{"builders":0,"reviewers":0,"viewers":-1}'::jsonb,
	"free_trial_started_at" timestamp with time zone,
	"free_trial_ends_at" timestamp with time zone,
	"free_trial_activated" boolean DEFAULT false,
	"assurance_free_trial_started_at" timestamp with time zone,
	"assurance_free_trial_ends_at" timestamp with time zone,
	"assurance_free_trial_activated" boolean DEFAULT false,
	"runs_override" integer,
	"conversations_override" integer,
	"features" jsonb DEFAULT '{}'::jsonb,
	"retention" jsonb DEFAULT '{"baseDays":7}'::jsonb,
	"billing" jsonb DEFAULT '{}'::jsonb,
	"integrations" jsonb,
	"manifest" jsonb,
	"connections" jsonb DEFAULT '{}'::jsonb,
	"cicd_config" jsonb,
	"evidence_vault" jsonb DEFAULT '{"storageMode":"lamdis_hosted"}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"user_sub" text NOT NULL,
	"role_id" uuid NOT NULL,
	"role_slug" text NOT NULL,
	"scope" jsonb,
	"expires_at" timestamp with time zone,
	"assigned_by" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_sub" text,
	"email" text,
	"role" text DEFAULT 'member',
	"status" text DEFAULT 'active',
	"licensed" boolean DEFAULT true,
	"licensed_at" timestamp with time zone,
	"licensed_by" text,
	"invited_by" text,
	"invited_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false,
	"inherits_from" text,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"denied_permissions" jsonb DEFAULT '[]'::jsonb,
	"auth0_role_id" text,
	"priority" integer DEFAULT 0,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"stripe_customer_id" text,
	"stripe_sub_id" text,
	"status" text DEFAULT 'trialing',
	"current_plan" text,
	"current_period_end" timestamp with time zone,
	"seats" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"suite_id" uuid,
	"key" text,
	"name" text NOT NULL,
	"description" text,
	"org_wide" boolean DEFAULT true,
	"enabled" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"environment_id" uuid NOT NULL,
	"assistant_id" uuid NOT NULL,
	"suite_id" uuid,
	"config" jsonb,
	"labels" jsonb DEFAULT '[]'::jsonb,
	"is_default" boolean DEFAULT false,
	"enabled" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"color" text,
	"order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"suite_id" uuid NOT NULL,
	"trigger" text DEFAULT 'manual',
	"git_context" jsonb,
	"env_id" text,
	"connection_key" text,
	"assistant" jsonb,
	"status" text DEFAULT 'queued',
	"stop_requested" boolean DEFAULT false,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"totals" jsonb,
	"summary_score" double precision,
	"progress" jsonb,
	"judge" jsonb,
	"error" jsonb,
	"items" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_suites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"default_env_id" text,
	"default_connection_key" text,
	"default_setup_id" uuid,
	"selected_conn_keys" jsonb DEFAULT '[]'::jsonb,
	"schedule" jsonb,
	"thresholds" jsonb,
	"labels" jsonb DEFAULT '[]'::jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"suite_id" uuid NOT NULL,
	"suite_ids" jsonb DEFAULT '[]'::jsonb,
	"folder_id" uuid,
	"name" text NOT NULL,
	"target" jsonb,
	"persona_id" text,
	"script" text NOT NULL,
	"pre_steps" jsonb DEFAULT '[]'::jsonb,
	"steps" jsonb DEFAULT '[]'::jsonb,
	"variables" jsonb DEFAULT '[]'::jsonb,
	"objective" text,
	"iterate" boolean DEFAULT true,
	"max_turns" integer DEFAULT 8,
	"min_turns" integer DEFAULT 1,
	"continue_after_pass" boolean DEFAULT false,
	"judge_config" jsonb,
	"assertions" jsonb DEFAULT '[]'::jsonb,
	"confirmations" jsonb DEFAULT '[]'::jsonb,
	"labels" jsonb DEFAULT '[]'::jsonb,
	"disabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workflow_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"org_slug" text,
	"idempotency_key" text,
	"policy" jsonb,
	"definition_hash" text,
	"input" jsonb,
	"context" jsonb,
	"steps" jsonb,
	"status" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"article_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content" jsonb,
	"content_type" text DEFAULT 'text/markdown',
	"status" text DEFAULT 'draft',
	"tags" jsonb DEFAULT '[]'::jsonb,
	"version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"path" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"article_id" text NOT NULL,
	"article_title" text,
	"categories" jsonb DEFAULT '[]'::jsonb,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manifest_access_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"manifest_version_id" uuid,
	"slug" text,
	"path_type" text,
	"digest" text,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"ua" text,
	"ip_hash" text
);
--> statement-breakpoint
CREATE TABLE "manifest_action_maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"manifest_id" uuid NOT NULL,
	"action_ids" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manifest_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"manifest_id" uuid,
	"semver" text NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb,
	"providers" jsonb DEFAULT '{}'::jsonb,
	"digest_sha256" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manifests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"visibility" text DEFAULT 'public',
	"external_published_at" timestamp with time zone,
	"external_slug" text,
	"allowed_consumers" jsonb,
	"channels" jsonb,
	"providers" jsonb DEFAULT '{}'::jsonb,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosted_action_invocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"action_key" text NOT NULL,
	"provider_key" text,
	"mode" text,
	"started_at" timestamp with time zone DEFAULT now(),
	"duration_ms" integer,
	"status_code" integer,
	"success" boolean,
	"prompt" text,
	"request_size" integer,
	"response_size" integer,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "invocation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"org_slug" text,
	"action_key" text,
	"provider_key" text,
	"route" text,
	"source" text NOT NULL,
	"request_id" text,
	"idempotency_key" text,
	"status" text NOT NULL,
	"status_code" integer,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"run_id" text NOT NULL,
	"suite_id" text NOT NULL,
	"env_id" text,
	"connection_key" text,
	"status" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_sec" integer,
	"items_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "installed_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"pack_slug" text NOT NULL,
	"installed_version" text NOT NULL,
	"suite_ids" jsonb DEFAULT '[]'::jsonb,
	"config" jsonb,
	"installed_by" text,
	"installed_at" timestamp with time zone DEFAULT now(),
	"last_updated" timestamp with time zone,
	"status" text DEFAULT 'active',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pack_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_slug" text NOT NULL,
	"test_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"severity" text DEFAULT 'medium',
	"persona" jsonb,
	"steps" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"framework_controls" jsonb DEFAULT '[]'::jsonb,
	"display_order" integer DEFAULT 0,
	"is_enabled" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"long_description" text,
	"version" text DEFAULT '1.0.0',
	"framework_slugs" jsonb DEFAULT '[]'::jsonb,
	"industries" jsonb DEFAULT '[]'::jsonb,
	"use_cases" jsonb DEFAULT '[]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"icon_url" text,
	"cover_image_url" text,
	"pricing" jsonb,
	"status" text DEFAULT 'published',
	"install_count" integer DEFAULT 0,
	"is_featured" boolean DEFAULT false,
	"display_order" integer DEFAULT 0,
	"default_thresholds" jsonb,
	"test_count" integer DEFAULT 0,
	"created_by" text,
	"last_updated_by" text,
	"release_notes" text,
	"changelog" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_packs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "action_bindings" ADD CONSTRAINT "action_bindings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistants" ADD CONSTRAINT "assistants_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_assistants" ADD CONSTRAINT "mock_assistants_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assurance_results" ADD CONSTRAINT "assurance_results_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assurance_suites" ADD CONSTRAINT "assurance_suites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assurance_tests" ADD CONSTRAINT "assurance_tests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_codes" ADD CONSTRAINT "join_codes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_installations" ADD CONSTRAINT "connector_installations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_installations" ADD CONSTRAINT "connector_installations_connector_id_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_claims" ADD CONSTRAINT "domain_claims_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_caches" ADD CONSTRAINT "export_caches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_variables" ADD CONSTRAINT "org_variables_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_access_logs" ADD CONSTRAINT "evidence_access_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_models" ADD CONSTRAINT "evidence_models_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_vault_entries" ADD CONSTRAINT "evidence_vault_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setups" ADD CONSTRAINT "setups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_folders" ADD CONSTRAINT "test_folders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_suite_id_test_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."test_suites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_suites" ADD CONSTRAINT "test_suites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_suite_id_test_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."test_suites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_categories" ADD CONSTRAINT "knowledge_categories_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_embeddings" ADD CONSTRAINT "knowledge_embeddings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manifest_action_maps" ADD CONSTRAINT "manifest_action_maps_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manifest_action_maps" ADD CONSTRAINT "manifest_action_maps_manifest_id_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."manifests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manifest_versions" ADD CONSTRAINT "manifest_versions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manifest_versions" ADD CONSTRAINT "manifest_versions_manifest_id_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."manifests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installed_packs" ADD CONSTRAINT "installed_packs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "action_bindings_org_action_env_unique" ON "action_bindings" USING btree ("org_id","action_id","environment_id");--> statement-breakpoint
CREATE INDEX "action_bindings_org_id_idx" ON "action_bindings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "action_bindings_action_id_idx" ON "action_bindings" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "action_bindings_environment_id_idx" ON "action_bindings" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX "action_packs_category_industry_idx" ON "action_packs" USING btree ("category","industry");--> statement-breakpoint
CREATE INDEX "action_packs_visibility_status_idx" ON "action_packs" USING btree ("visibility","status");--> statement-breakpoint
CREATE INDEX "action_templates_provider_idx" ON "action_templates" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "action_templates_category_idx" ON "action_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "action_templates_status_idx" ON "action_templates" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "actions_org_action_id_unique" ON "actions" USING btree ("org_id","action_id");--> statement-breakpoint
CREATE INDEX "actions_org_id_idx" ON "actions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "request_templates_provider_idx" ON "request_templates" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "request_templates_category_idx" ON "request_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "request_templates_status_idx" ON "request_templates" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_org_agent_id_unique" ON "agents" USING btree ("org_id","agent_id");--> statement-breakpoint
CREATE INDEX "agents_org_id_idx" ON "agents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "agents_visibility_idx" ON "agents" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "agents_external_slug_idx" ON "agents" USING btree ("external_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "assistants_org_key_version_unique" ON "assistants" USING btree ("org_id","key","version");--> statement-breakpoint
CREATE INDEX "assistants_org_id_idx" ON "assistants" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mock_assistants_org_name_unique" ON "mock_assistants" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "mock_assistants_org_id_idx" ON "mock_assistants" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "personas_org_name_unique" ON "personas" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "personas_org_id_idx" ON "personas" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assurance_results_org_trace_id_unique" ON "assurance_results" USING btree ("org_id","trace_id");--> statement-breakpoint
CREATE INDEX "assurance_results_org_id_idx" ON "assurance_results" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "assurance_results_evidence_model_id_idx" ON "assurance_results" USING btree ("evidence_model_id");--> statement-breakpoint
CREATE INDEX "assurance_results_vault_entry_id_idx" ON "assurance_results" USING btree ("vault_entry_id");--> statement-breakpoint
CREATE INDEX "assurance_results_trace_id_idx" ON "assurance_results" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "assurance_results_correlation_id_idx" ON "assurance_results" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "assurance_results_session_id_idx" ON "assurance_results" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "assurance_results_org_model_status_idx" ON "assurance_results" USING btree ("org_id","evidence_model_id","status");--> statement-breakpoint
CREATE INDEX "assurance_results_org_model_received_idx" ON "assurance_results" USING btree ("org_id","evidence_model_id","received_at");--> statement-breakpoint
CREATE INDEX "assurance_results_org_review_status_idx" ON "assurance_results" USING btree ("org_id","review_status","status");--> statement-breakpoint
CREATE INDEX "assurance_results_org_review_received_idx" ON "assurance_results" USING btree ("org_id","review_status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "assurance_suites_org_name_unique" ON "assurance_suites" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "assurance_suites_org_id_idx" ON "assurance_suites" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "assurance_suites_org_mode_idx" ON "assurance_suites" USING btree ("org_id","mode");--> statement-breakpoint
CREATE INDEX "assurance_tests_org_id_idx" ON "assurance_tests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "assurance_tests_evidence_model_id_idx" ON "assurance_tests" USING btree ("evidence_model_id");--> statement-breakpoint
CREATE INDEX "assurance_tests_org_category_idx" ON "assurance_tests" USING btree ("org_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_unique" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_org_status_idx" ON "api_keys" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "api_keys_org_key_prefix_idx" ON "api_keys" USING btree ("org_id","key_prefix");--> statement-breakpoint
CREATE INDEX "api_keys_key_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "join_codes_org_id_idx" ON "join_codes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "join_codes_expires_at_idx" ON "join_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_states_org_id_idx" ON "oauth_states" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "oauth_states_user_sub_idx" ON "oauth_states" USING btree ("user_sub");--> statement-breakpoint
CREATE UNIQUE INDEX "user_credentials_org_user_provider_unique" ON "user_credentials" USING btree ("org_id","user_sub","provider");--> statement-breakpoint
CREATE INDEX "user_credentials_org_id_idx" ON "user_credentials" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "user_credentials_user_sub_idx" ON "user_credentials" USING btree ("user_sub");--> statement-breakpoint
CREATE INDEX "user_profiles_email_idx" ON "user_profiles" USING btree ("email");--> statement-breakpoint
CREATE INDEX "connector_installations_org_id_idx" ON "connector_installations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "connectors_status_idx" ON "connectors" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "export_caches_org_semver_format_unique" ON "export_caches" USING btree ("org_id","semver","format");--> statement-breakpoint
CREATE INDEX "export_caches_org_id_idx" ON "export_caches" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_variables_org_key_unique" ON "org_variables" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX "org_variables_org_id_idx" ON "org_variables" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "audit_logs_org_timestamp_idx" ON "audit_logs" USING btree ("org_id","timestamp");--> statement-breakpoint
CREATE INDEX "audit_logs_org_category_timestamp_idx" ON "audit_logs" USING btree ("org_id","category","timestamp");--> statement-breakpoint
CREATE INDEX "audit_logs_org_action_timestamp_idx" ON "audit_logs" USING btree ("org_id","action","timestamp");--> statement-breakpoint
CREATE INDEX "evidence_access_logs_org_ts_idx" ON "evidence_access_logs" USING btree ("org_id","ts");--> statement-breakpoint
CREATE INDEX "evidence_access_logs_org_resource_ts_idx" ON "evidence_access_logs" USING btree ("org_id","resource_id","ts");--> statement-breakpoint
CREATE INDEX "evidence_access_logs_org_actor_ts_idx" ON "evidence_access_logs" USING btree ("org_id","actor_sub","ts");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_models_org_name_unique" ON "evidence_models" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "evidence_models_org_id_idx" ON "evidence_models" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "evidence_vault_entries_org_id_idx" ON "evidence_vault_entries" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "evidence_vault_entries_evidence_model_id_idx" ON "evidence_vault_entries" USING btree ("evidence_model_id");--> statement-breakpoint
CREATE INDEX "evidence_vault_entries_org_model_created_idx" ON "evidence_vault_entries" USING btree ("org_id","evidence_model_id","created_at");--> statement-breakpoint
CREATE INDEX "evidence_vault_entries_org_status_created_idx" ON "evidence_vault_entries" USING btree ("org_id","status","created_at");--> statement-breakpoint
CREATE INDEX "evidence_vault_entries_org_result_created_idx" ON "evidence_vault_entries" USING btree ("org_id","overall_result","created_at");--> statement-breakpoint
CREATE INDEX "evidence_vault_entries_org_flagged_created_idx" ON "evidence_vault_entries" USING btree ("org_id","flagged_for_review","created_at");--> statement-breakpoint
CREATE INDEX "evidence_vault_entries_org_storage_created_idx" ON "evidence_vault_entries" USING btree ("org_id","storage_mode","created_at");--> statement-breakpoint
CREATE INDEX "evidence_vault_entries_scheduled_deletion_idx" ON "evidence_vault_entries" USING btree ("scheduled_deletion_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organizations_auth0_org_id_idx" ON "organizations" USING btree ("auth0_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_roles_org_member_role_unique" ON "member_roles" USING btree ("org_id","member_id","role_id");--> statement-breakpoint
CREATE INDEX "member_roles_org_user_sub_idx" ON "member_roles" USING btree ("org_id","user_sub");--> statement-breakpoint
CREATE UNIQUE INDEX "members_org_user_sub_unique" ON "members" USING btree ("org_id","user_sub");--> statement-breakpoint
CREATE UNIQUE INDEX "members_org_email_unique" ON "members" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "members_org_id_idx" ON "members" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "members_user_sub_idx" ON "members" USING btree ("user_sub");--> statement-breakpoint
CREATE INDEX "members_status_idx" ON "members" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_org_slug_unique" ON "roles" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "roles_org_id_idx" ON "roles" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_org_id_unique" ON "subscriptions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_customer_id_idx" ON "subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_sub_id_idx" ON "subscriptions" USING btree ("stripe_sub_id");--> statement-breakpoint
CREATE UNIQUE INDEX "environments_org_key_unique" ON "environments" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX "environments_org_id_idx" ON "environments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "environments_org_suite_idx" ON "environments" USING btree ("org_id","suite_id");--> statement-breakpoint
CREATE UNIQUE INDEX "setups_org_key_unique" ON "setups" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX "setups_org_id_idx" ON "setups" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "setups_org_suite_idx" ON "setups" USING btree ("org_id","suite_id");--> statement-breakpoint
CREATE INDEX "setups_org_env_idx" ON "setups" USING btree ("org_id","environment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "test_folders_org_name_parent_unique" ON "test_folders" USING btree ("org_id","name","parent_id");--> statement-breakpoint
CREATE INDEX "test_folders_org_id_idx" ON "test_folders" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "test_runs_org_id_idx" ON "test_runs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "test_runs_suite_id_idx" ON "test_runs" USING btree ("suite_id");--> statement-breakpoint
CREATE INDEX "test_runs_status_idx" ON "test_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "test_runs_connection_key_idx" ON "test_runs" USING btree ("connection_key");--> statement-breakpoint
CREATE UNIQUE INDEX "test_suites_org_name_unique" ON "test_suites" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "test_suites_org_id_idx" ON "test_suites" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tests_org_suite_name_unique" ON "tests" USING btree ("org_id","suite_id","name");--> statement-breakpoint
CREATE INDEX "tests_org_id_idx" ON "tests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "tests_suite_id_idx" ON "tests" USING btree ("suite_id");--> statement-breakpoint
CREATE INDEX "tests_folder_id_idx" ON "tests" USING btree ("folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_definitions_org_workflow_id_unique" ON "workflow_definitions" USING btree ("org_id","workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_definitions_org_id_idx" ON "workflow_definitions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_org_id_idx" ON "workflow_runs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_org_slug_idx" ON "workflow_runs" USING btree ("org_slug");--> statement-breakpoint
CREATE INDEX "workflow_runs_idempotency_key_idx" ON "workflow_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "workflow_runs_definition_hash_idx" ON "workflow_runs" USING btree ("definition_hash");--> statement-breakpoint
CREATE INDEX "workflow_runs_status_idx" ON "workflow_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_runs_created_at_idx" ON "workflow_runs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_articles_org_article_id_unique" ON "knowledge_articles" USING btree ("org_id","article_id");--> statement-breakpoint
CREATE INDEX "knowledge_articles_org_id_idx" ON "knowledge_articles" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_categories_org_path_unique" ON "knowledge_categories" USING btree ("org_id","path");--> statement-breakpoint
CREATE INDEX "knowledge_categories_org_id_idx" ON "knowledge_categories" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_embeddings_org_article_chunk_unique" ON "knowledge_embeddings" USING btree ("org_id","article_id","chunk_index");--> statement-breakpoint
CREATE INDEX "knowledge_embeddings_org_id_idx" ON "knowledge_embeddings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "knowledge_embeddings_article_id_idx" ON "knowledge_embeddings" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX "knowledge_embeddings_org_updated_at_idx" ON "knowledge_embeddings" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "knowledge_embeddings_embedding_idx" ON "knowledge_embeddings" USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);--> statement-breakpoint
CREATE INDEX "manifest_access_logs_org_ts_idx" ON "manifest_access_logs" USING btree ("org_id","ts");--> statement-breakpoint
CREATE INDEX "manifest_access_logs_path_type_ts_idx" ON "manifest_access_logs" USING btree ("path_type","ts");--> statement-breakpoint
CREATE INDEX "manifest_access_logs_slug_idx" ON "manifest_access_logs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "manifest_access_logs_ip_hash_idx" ON "manifest_access_logs" USING btree ("ip_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "manifest_action_maps_org_manifest_unique" ON "manifest_action_maps" USING btree ("org_id","manifest_id");--> statement-breakpoint
CREATE INDEX "manifest_action_maps_org_id_idx" ON "manifest_action_maps" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "manifest_versions_org_semver_unique" ON "manifest_versions" USING btree ("org_id","semver");--> statement-breakpoint
CREATE INDEX "manifest_versions_org_id_idx" ON "manifest_versions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "manifest_versions_manifest_id_idx" ON "manifest_versions" USING btree ("manifest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "manifests_org_slug_unique" ON "manifests" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "manifests_org_id_idx" ON "manifests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "manifests_visibility_idx" ON "manifests" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "manifests_external_slug_idx" ON "manifests" USING btree ("external_slug");--> statement-breakpoint
CREATE INDEX "hosted_action_invocations_org_id_idx" ON "hosted_action_invocations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "hosted_action_invocations_org_started_idx" ON "hosted_action_invocations" USING btree ("org_id","started_at");--> statement-breakpoint
CREATE INDEX "hosted_action_invocations_action_started_idx" ON "hosted_action_invocations" USING btree ("action_key","started_at");--> statement-breakpoint
CREATE INDEX "hosted_action_invocations_success_idx" ON "hosted_action_invocations" USING btree ("success");--> statement-breakpoint
CREATE INDEX "invocation_logs_org_id_idx" ON "invocation_logs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "invocation_logs_org_slug_idx" ON "invocation_logs" USING btree ("org_slug");--> statement-breakpoint
CREATE INDEX "invocation_logs_source_idx" ON "invocation_logs" USING btree ("source");--> statement-breakpoint
CREATE INDEX "invocation_logs_idempotency_key_idx" ON "invocation_logs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "invocation_logs_status_idx" ON "invocation_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invocation_logs_created_at_idx" ON "invocation_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "usage_org_id_idx" ON "usage" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "usage_suite_id_idx" ON "usage" USING btree ("suite_id");--> statement-breakpoint
CREATE INDEX "usage_finished_at_idx" ON "usage" USING btree ("finished_at");--> statement-breakpoint
CREATE UNIQUE INDEX "installed_packs_org_pack_unique" ON "installed_packs" USING btree ("org_id","pack_slug");--> statement-breakpoint
CREATE INDEX "installed_packs_org_id_idx" ON "installed_packs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "installed_packs_pack_slug_idx" ON "installed_packs" USING btree ("pack_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "pack_tests_pack_slug_test_key_unique" ON "pack_tests" USING btree ("pack_slug","test_key");--> statement-breakpoint
CREATE INDEX "pack_tests_pack_slug_idx" ON "pack_tests" USING btree ("pack_slug");--> statement-breakpoint
CREATE INDEX "test_packs_status_idx" ON "test_packs" USING btree ("status");