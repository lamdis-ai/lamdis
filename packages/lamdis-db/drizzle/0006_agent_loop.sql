-- Migration: Autonomous Agent Loop
-- Adds agent tasks, input requests, activity log tables and agent columns on existing tables.

-- New columns on outcome_types
ALTER TABLE outcome_types ADD COLUMN agent_config jsonb;

-- New columns on outcome_instances
ALTER TABLE outcome_instances ADD COLUMN agent_enabled boolean DEFAULT false;
ALTER TABLE outcome_instances ADD COLUMN agent_status text DEFAULT 'idle';
ALTER TABLE outcome_instances ADD COLUMN current_plan jsonb;
ALTER TABLE outcome_instances ADD COLUMN goal_description text;
ALTER TABLE outcome_instances ADD COLUMN guidelines jsonb;
ALTER TABLE outcome_instances ADD COLUMN user_contact jsonb;

-- Input Requests — structured requests from agent to user
CREATE TABLE input_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  outcome_instance_id uuid NOT NULL REFERENCES outcome_instances(id),
  agent_task_id uuid,
  request_type text NOT NULL,
  title text NOT NULL,
  description text,
  schema jsonb DEFAULT '{}',
  status text DEFAULT 'pending',
  priority text DEFAULT 'normal',
  response jsonb,
  responded_by text,
  responded_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX input_requests_org_id_idx ON input_requests(org_id);
CREATE INDEX input_requests_instance_idx ON input_requests(outcome_instance_id);
CREATE INDEX input_requests_org_status_idx ON input_requests(org_id, status);

-- Agent Tasks — planned steps in an outcome's execution plan
CREATE TABLE agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  outcome_instance_id uuid NOT NULL REFERENCES outcome_instances(id),
  parent_task_id uuid REFERENCES agent_tasks(id),
  sequence integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  description text,
  status text DEFAULT 'planned',
  task_type text NOT NULL,
  action_id uuid REFERENCES actions(id),
  action_input jsonb,
  action_output jsonb,
  input_request_id uuid REFERENCES input_requests(id),
  blocked_reason text,
  depends_on jsonb DEFAULT '[]',
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 2,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_tasks_org_id_idx ON agent_tasks(org_id);
CREATE INDEX agent_tasks_instance_idx ON agent_tasks(outcome_instance_id);
CREATE INDEX agent_tasks_instance_status_idx ON agent_tasks(outcome_instance_id, status);
CREATE INDEX agent_tasks_parent_idx ON agent_tasks(parent_task_id);

-- Back-fill FK on input_requests now that agent_tasks exists
ALTER TABLE input_requests ADD CONSTRAINT input_requests_agent_task_id_fk FOREIGN KEY (agent_task_id) REFERENCES agent_tasks(id);

-- Agent Activity Log — fine-grained live feed
CREATE TABLE agent_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  outcome_instance_id uuid NOT NULL REFERENCES outcome_instances(id),
  agent_task_id uuid REFERENCES agent_tasks(id),
  activity_type text NOT NULL,
  summary text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_activity_log_instance_idx ON agent_activity_log(outcome_instance_id);
CREATE INDEX agent_activity_log_instance_created_idx ON agent_activity_log(outcome_instance_id, created_at);

-- Index for finding agent-enabled instances (used by periodic scheduler)
CREATE INDEX outcome_instances_agent_enabled_idx ON outcome_instances(agent_enabled) WHERE agent_enabled = true;
