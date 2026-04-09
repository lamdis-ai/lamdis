-- Categories table
CREATE TABLE IF NOT EXISTS "categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "parent_id" uuid REFERENCES "categories"("id"),
  "entity_type" text DEFAULT 'all',
  "color" text,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "categories_org_parent_idx" ON "categories" USING btree ("org_id","parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "categories_org_entity_type_idx" ON "categories" USING btree ("org_id","entity_type");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categories_org_slug_parent_unique" ON "categories" USING btree ("org_id","slug","parent_id");
--> statement-breakpoint

-- Policies table
CREATE TABLE IF NOT EXISTS "policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "title" text NOT NULL,
  "content" text NOT NULL DEFAULT '',
  "category_id" uuid REFERENCES "categories"("id"),
  "tags" jsonb DEFAULT '[]'::jsonb,
  "status" text DEFAULT 'draft',
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policies_org_id_idx" ON "policies" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policies_org_category_idx" ON "policies" USING btree ("org_id","category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policies_org_status_idx" ON "policies" USING btree ("org_id","status");
--> statement-breakpoint

-- Policy Versions table
CREATE TABLE IF NOT EXISTS "policy_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "policy_id" uuid NOT NULL REFERENCES "policies"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "changed_by" text,
  "change_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "policy_versions_policy_version_unique" ON "policy_versions" USING btree ("policy_id","version");
--> statement-breakpoint

-- Add source_policy_id and category_id to workflows
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "source_policy_id" uuid REFERENCES "policies"("id");
--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "category_id" uuid REFERENCES "categories"("id");
--> statement-breakpoint

-- Add category_id to policy_checks
ALTER TABLE "policy_checks" ADD COLUMN IF NOT EXISTS "category_id" uuid REFERENCES "categories"("id");
