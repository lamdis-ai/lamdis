-- Add evaluation_schedules table for CRON-like continuous evaluation
CREATE TABLE IF NOT EXISTS evaluation_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  objective_type_id UUID NOT NULL REFERENCES outcome_types(id) ON DELETE CASCADE,
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  last_run_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evaluation_schedules_org_id_idx ON evaluation_schedules(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS evaluation_schedules_org_objective_unique ON evaluation_schedules(org_id, objective_type_id);
CREATE INDEX IF NOT EXISTS evaluation_schedules_next_run_idx ON evaluation_schedules(next_run_at);
