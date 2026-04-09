-- Teams: named groups of people for org structure
CREATE TABLE IF NOT EXISTS "teams" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "description" text,
  "color" text DEFAULT '#8b5cf6',
  "created_by" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "teams_org_name_unique" ON "teams" ("org_id", "name");
CREATE INDEX IF NOT EXISTS "teams_org_id_idx" ON "teams" ("org_id");

-- Team membership
CREATE TABLE IF NOT EXISTS "team_members" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "member_id" uuid NOT NULL REFERENCES "members"("id") ON DELETE CASCADE,
  "role" text DEFAULT 'member',
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "team_members_team_member_unique" ON "team_members" ("team_id", "member_id");
CREATE INDEX IF NOT EXISTS "team_members_team_id_idx" ON "team_members" ("team_id");
CREATE INDEX IF NOT EXISTS "team_members_member_id_idx" ON "team_members" ("member_id");
