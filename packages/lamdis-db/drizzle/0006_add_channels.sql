-- Add channels table for deployable chat endpoints
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  channel_type TEXT NOT NULL DEFAULT 'customer',
  auth_method TEXT NOT NULL DEFAULT 'email_verification',
  auth_config JSONB DEFAULT '{}',
  linked_objective_ids JSONB DEFAULT '[]',
  permissions JSONB DEFAULT '["provide_evidence", "view_own_status"]',
  multimodal JSONB DEFAULT '{}',
  deployment_key TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS channels_org_id_idx ON channels(org_id);
CREATE INDEX IF NOT EXISTS channels_deployment_key_idx ON channels(deployment_key);

-- Add channel_id FK to conversation_sessions
ALTER TABLE conversation_sessions ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES channels(id);
