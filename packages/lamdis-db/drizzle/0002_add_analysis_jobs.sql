CREATE TABLE IF NOT EXISTS "analysis_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending',
	"input_summary" jsonb,
	"result" jsonb,
	"error" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analysis_jobs_org_id_idx" ON "analysis_jobs" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analysis_jobs_org_created_idx" ON "analysis_jobs" USING btree ("org_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analysis_jobs_org_type_idx" ON "analysis_jobs" USING btree ("org_id","type");
