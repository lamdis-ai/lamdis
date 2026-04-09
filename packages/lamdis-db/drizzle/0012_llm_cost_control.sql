-- LLM Cost Control & Token Monitoring
-- New tables: llm_usage_events, llm_budgets, llm_usage_rollups
--
-- Captures token + cost telemetry for every Bedrock invocation, holds
-- budget configuration at every scope, and maintains pre-aggregated
-- rollups so the budget gate stays cheap on hot paths.

-- ============================================================================
-- llm_usage_events
-- ============================================================================

CREATE TABLE IF NOT EXISTS "llm_usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "outcome_instance_id" uuid,
  "outcome_type_id" uuid,
  "agent_task_id" uuid,
  "user_id" text,
  "service_key" text NOT NULL,
  "model_id" text NOT NULL,
  "input_tokens" integer NOT NULL DEFAULT 0,
  "output_tokens" integer NOT NULL DEFAULT 0,
  "total_tokens" integer NOT NULL DEFAULT 0,
  "cached_input_tokens" integer NOT NULL DEFAULT 0,
  "cost_usd" numeric(14,8) NOT NULL DEFAULT 0,
  "duration_ms" integer,
  "status" text NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "llm_usage_events_org_created_idx" ON "llm_usage_events" ("org_id", "created_at");
CREATE INDEX IF NOT EXISTS "llm_usage_events_org_service_idx" ON "llm_usage_events" ("org_id", "service_key");
CREATE INDEX IF NOT EXISTS "llm_usage_events_outcome_instance_idx" ON "llm_usage_events" ("outcome_instance_id");
CREATE INDEX IF NOT EXISTS "llm_usage_events_outcome_type_idx" ON "llm_usage_events" ("outcome_type_id");
CREATE INDEX IF NOT EXISTS "llm_usage_events_agent_task_idx" ON "llm_usage_events" ("agent_task_id");
CREATE INDEX IF NOT EXISTS "llm_usage_events_model_idx" ON "llm_usage_events" ("model_id");

-- ============================================================================
-- llm_budgets
-- ============================================================================

CREATE TABLE IF NOT EXISTS "llm_budgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "scope" text NOT NULL,
  "scope_ref_id" text,
  "period_type" text NOT NULL,
  "limit_usd" numeric(14,4) NOT NULL,
  "warning_threshold_pct" integer NOT NULL DEFAULT 80,
  "enforcement_mode" text NOT NULL DEFAULT 'block',
  "enabled" boolean NOT NULL DEFAULT true,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "llm_budgets_org_scope_uq" ON "llm_budgets" ("org_id", "scope", "scope_ref_id", "period_type");
CREATE INDEX IF NOT EXISTS "llm_budgets_org_idx" ON "llm_budgets" ("org_id");

-- ============================================================================
-- llm_usage_rollups
-- ============================================================================

CREATE TABLE IF NOT EXISTS "llm_usage_rollups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL,
  "scope" text NOT NULL,
  "scope_ref_id" text,
  "period_type" text NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "total_input_tokens" bigint NOT NULL DEFAULT 0,
  "total_output_tokens" bigint NOT NULL DEFAULT 0,
  "total_tokens" bigint NOT NULL DEFAULT 0,
  "total_cost_usd" numeric(16,8) NOT NULL DEFAULT 0,
  "call_count" integer NOT NULL DEFAULT 0,
  "last_warning_sent_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "llm_usage_rollups_uq" ON "llm_usage_rollups" ("org_id", "scope", "scope_ref_id", "period_type", "period_start");
CREATE INDEX IF NOT EXISTS "llm_usage_rollups_org_idx" ON "llm_usage_rollups" ("org_id");
CREATE INDEX IF NOT EXISTS "llm_usage_rollups_lookup_idx" ON "llm_usage_rollups" ("org_id", "scope", "period_type", "period_start");
