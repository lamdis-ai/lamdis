-- Migration: Pivot to Proof-Gated Outcome Automation Engine
-- Renames workflow tables to outcome vocabulary, adds automation columns and new tables.

-- Rename tables
ALTER TABLE workflows RENAME TO outcome_types;
ALTER TABLE workflow_suites RENAME TO outcome_groups;
ALTER TABLE workflow_instances RENAME TO outcome_instances;
ALTER TABLE policy_checks RENAME TO proof_expectations;
ALTER TABLE boundary_definitions RENAME TO decision_boundaries;

-- Rename FK columns
ALTER TABLE outcome_instances RENAME COLUMN workflow_id TO outcome_type_id;
ALTER TABLE proof_expectations RENAME COLUMN workflow_id TO outcome_type_id;
ALTER TABLE evidence_events RENAME COLUMN workflow_instance_id TO outcome_instance_id;
ALTER TABLE runs RENAME COLUMN suite_id TO outcome_group_id;

-- New columns on outcome_types
ALTER TABLE outcome_types ADD COLUMN success_criteria jsonb DEFAULT '[]';
ALTER TABLE outcome_types ADD COLUMN key_decisions jsonb DEFAULT '[]';
ALTER TABLE outcome_types ADD COLUMN automation_boundaries jsonb DEFAULT '{}';
ALTER TABLE outcome_types ADD COLUMN connected_systems jsonb DEFAULT '[]';
ALTER TABLE outcome_types ADD COLUMN risk_class text DEFAULT 'standard';

-- New columns on outcome_instances
ALTER TABLE outcome_instances ADD COLUMN confidence_score double precision;
ALTER TABLE outcome_instances ADD COLUMN proof_status text DEFAULT 'gathering';
ALTER TABLE outcome_instances ADD COLUMN next_likely_action jsonb;
ALTER TABLE outcome_instances ADD COLUMN automation_mode text DEFAULT 'manual';
ALTER TABLE outcome_instances ADD COLUMN escalation_reason text;
ALTER TABLE outcome_instances ADD COLUMN stalled_since timestamp with time zone;

-- New columns on proof_expectations
ALTER TABLE proof_expectations ADD COLUMN risk_class text DEFAULT 'standard';
ALTER TABLE proof_expectations ADD COLUMN proof_threshold double precision DEFAULT 0.8;
ALTER TABLE proof_expectations ADD COLUMN auto_approve boolean DEFAULT false;

-- New columns on decision_boundaries
ALTER TABLE decision_boundaries ADD COLUMN risk_level text DEFAULT 'medium';
ALTER TABLE decision_boundaries ADD COLUMN auto_execute boolean DEFAULT false;
ALTER TABLE decision_boundaries ADD COLUMN escalation_policy jsonb;
ALTER TABLE decision_boundaries ADD COLUMN requires_human_approval boolean DEFAULT true;

-- New column on runs
ALTER TABLE runs ADD COLUMN mode text DEFAULT 'live';

-- New table: action_executions
CREATE TABLE action_executions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  outcome_instance_id uuid,
  action_id uuid REFERENCES actions(id),
  proposed_by text DEFAULT 'system',
  evidence_snapshot jsonb,
  proof_threshold_met boolean DEFAULT false,
  risk_class text DEFAULT 'standard',
  status text DEFAULT 'proposed',
  blocked_reason text,
  approval jsonb,
  execution_log jsonb,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX action_executions_org_id_idx ON action_executions(org_id);
CREATE INDEX action_executions_org_status_idx ON action_executions(org_id, status);
CREATE INDEX action_executions_instance_idx ON action_executions(outcome_instance_id);

-- New table: decision_dossiers
CREATE TABLE decision_dossiers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  outcome_instance_id uuid,
  action_execution_id uuid REFERENCES action_executions(id),
  decision_type text NOT NULL,
  summary text,
  facts_considered jsonb DEFAULT '[]',
  evidence_ids jsonb DEFAULT '[]',
  proof_chain jsonb DEFAULT '[]',
  confidence_score double precision,
  risk_assessment jsonb,
  boundary_applied jsonb,
  actor text DEFAULT 'system',
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX decision_dossiers_org_id_idx ON decision_dossiers(org_id);
CREATE INDEX decision_dossiers_org_created_idx ON decision_dossiers(org_id, created_at);
CREATE INDEX decision_dossiers_instance_idx ON decision_dossiers(outcome_instance_id);

-- New table: connection_health
CREATE TABLE connection_health (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  connector_installation_id uuid,
  connection_key text,
  category text DEFAULT 'event_source',
  auth_status text DEFAULT 'healthy',
  event_volume_24h integer DEFAULT 0,
  recent_failures integer DEFAULT 0,
  last_health_check timestamp with time zone,
  last_failure_reason text,
  domains_touched jsonb DEFAULT '[]',
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX connection_health_org_id_idx ON connection_health(org_id);

-- New table: conversation_sessions
CREATE TABLE conversation_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  outcome_instance_id uuid,
  channel text NOT NULL DEFAULT 'chat',
  external_session_id text,
  participant_id text,
  participant_type text DEFAULT 'customer',
  status text DEFAULT 'active',
  context jsonb DEFAULT '{}',
  auth_token_hash text,
  allowed_scopes jsonb DEFAULT '["read_own", "provide_evidence"]',
  last_message_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX conversation_sessions_org_id_idx ON conversation_sessions(org_id);
CREATE INDEX conversation_sessions_instance_idx ON conversation_sessions(outcome_instance_id);
CREATE INDEX conversation_sessions_external_idx ON conversation_sessions(org_id, external_session_id);

-- Rename indexes that reference old names (PostgreSQL keeps index names after table rename)
ALTER INDEX IF EXISTS workflows_org_name_unique RENAME TO outcome_types_org_name_unique;
ALTER INDEX IF EXISTS workflows_org_id_idx RENAME TO outcome_types_org_id_idx;
ALTER INDEX IF EXISTS workflow_instances_org_id_idx RENAME TO outcome_instances_org_id_idx;
ALTER INDEX IF EXISTS workflow_instances_org_status_idx RENAME TO outcome_instances_org_status_idx;
ALTER INDEX IF EXISTS policy_checks_org_id_idx RENAME TO proof_expectations_org_id_idx;
ALTER INDEX IF EXISTS policy_checks_workflow_id_idx RENAME TO proof_expectations_outcome_type_id_idx;
