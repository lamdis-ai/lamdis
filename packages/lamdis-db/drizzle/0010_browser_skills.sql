-- Browser Skills — learned procedures from user demonstrations in the live browser view

CREATE TABLE IF NOT EXISTS browser_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  domain text NOT NULL,
  url_pattern text,
  name text NOT NULL,
  intent text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  page_state_snapshot text,
  source text DEFAULT 'user_demonstration',
  success_count integer DEFAULT 0,
  success_times integer DEFAULT 0,
  failure_count integer DEFAULT 0,
  last_used_at timestamp with time zone,
  created_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS browser_skills_org_id_idx ON browser_skills(org_id);
CREATE INDEX IF NOT EXISTS browser_skills_org_domain_idx ON browser_skills(org_id, domain);
