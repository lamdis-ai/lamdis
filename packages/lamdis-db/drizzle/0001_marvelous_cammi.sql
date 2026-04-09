CREATE TABLE "contact_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text,
	"message" text NOT NULL,
	"source" text DEFAULT 'website',
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boundary_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"boundary_type" text DEFAULT 'service',
	"detection_method" text DEFAULT 'manual',
	"service_identifiers" jsonb DEFAULT '[]'::jsonb,
	"event_types" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workflow_instance_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"event_source" text NOT NULL,
	"source_service_id" text,
	"payload" jsonb NOT NULL,
	"confirmation_level" text,
	"parent_event_id" uuid,
	"idempotency_key" text,
	"sequence_number" integer,
	"emitted_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "policy_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'compliance',
	"severity" text DEFAULT 'error',
	"check_type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"required_evidence_level" text DEFAULT 'A',
	"judge_threshold" double precision DEFAULT 0.75,
	"on_pass" jsonb DEFAULT '[]'::jsonb,
	"on_fail" jsonb DEFAULT '[]'::jsonb,
	"applies_to" jsonb,
	"enabled" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"suite_id" uuid,
	"trigger" text DEFAULT 'manual',
	"environment" text DEFAULT 'ci',
	"git_context" jsonb,
	"status" text DEFAULT 'queued',
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"totals" jsonb,
	"summary_score" double precision,
	"progress" jsonb,
	"instance_ids" jsonb DEFAULT '[]'::jsonb,
	"webhook_url" text,
	"error" jsonb,
	"stop_requested" boolean DEFAULT false,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workflow_id" uuid,
	"environment" text DEFAULT 'production',
	"trigger" text DEFAULT 'sdk',
	"status" text DEFAULT 'open',
	"highest_confirmation_level" text,
	"event_count" integer DEFAULT 0,
	"first_event_at" timestamp with time zone,
	"last_event_at" timestamp with time zone,
	"evaluated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"run_id" uuid,
	"check_results" jsonb DEFAULT '[]'::jsonb,
	"totals" jsonb,
	"transcript" jsonb,
	"git_context" jsonb,
	"review_status" text,
	"review" jsonb,
	"comments" jsonb,
	"status_history" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_suites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"schedule" jsonb,
	"thresholds" jsonb,
	"webhook" jsonb,
	"labels" jsonb DEFAULT '[]'::jsonb,
	"disabled" boolean DEFAULT false,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"suite_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'operational',
	"tags" jsonb DEFAULT '[]'::jsonb,
	"labels" jsonb DEFAULT '[]'::jsonb,
	"expected_event_types" jsonb DEFAULT '[]'::jsonb,
	"boundary_config" jsonb,
	"timeout_ms" integer DEFAULT 1800000,
	"synthetic_script" jsonb,
	"disabled" boolean DEFAULT false,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "environments_org_suite_idx";--> statement-breakpoint
ALTER TABLE "tests" ALTER COLUMN "script" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "assurance_results" ADD COLUMN "suite_id" text;--> statement-breakpoint
ALTER TABLE "boundary_definitions" ADD CONSTRAINT "boundary_definitions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_events" ADD CONSTRAINT "evidence_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_checks" ADD CONSTRAINT "policy_checks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_checks" ADD CONSTRAINT "policy_checks_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_suite_id_workflow_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."workflow_suites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_instances" ADD CONSTRAINT "workflow_instances_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_suites" ADD CONSTRAINT "workflow_suites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_suite_id_workflow_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."workflow_suites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_submissions_email_idx" ON "contact_submissions" USING btree ("email");--> statement-breakpoint
CREATE INDEX "boundary_definitions_org_id_idx" ON "boundary_definitions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "evidence_events_instance_id_idx" ON "evidence_events" USING btree ("workflow_instance_id");--> statement-breakpoint
CREATE INDEX "evidence_events_org_instance_idx" ON "evidence_events" USING btree ("org_id","workflow_instance_id");--> statement-breakpoint
CREATE INDEX "evidence_events_org_type_idx" ON "evidence_events" USING btree ("org_id","event_type");--> statement-breakpoint
CREATE INDEX "evidence_events_org_received_idx" ON "evidence_events" USING btree ("org_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_events_idempotency_key_unique" ON "evidence_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "evidence_events_instance_seq_idx" ON "evidence_events" USING btree ("workflow_instance_id","sequence_number");--> statement-breakpoint
CREATE INDEX "policy_checks_org_id_idx" ON "policy_checks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "policy_checks_workflow_id_idx" ON "policy_checks" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "policy_checks_org_category_idx" ON "policy_checks" USING btree ("org_id","category");--> statement-breakpoint
CREATE INDEX "runs_org_id_idx" ON "runs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "runs_suite_id_idx" ON "runs" USING btree ("suite_id");--> statement-breakpoint
CREATE INDEX "runs_org_status_idx" ON "runs" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "runs_org_created_idx" ON "runs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_instances_org_id_idx" ON "workflow_instances" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "workflow_instances_workflow_id_idx" ON "workflow_instances" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_instances_org_status_idx" ON "workflow_instances" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "workflow_instances_org_env_idx" ON "workflow_instances" USING btree ("org_id","environment");--> statement-breakpoint
CREATE INDEX "workflow_instances_run_id_idx" ON "workflow_instances" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "workflow_instances_org_created_idx" ON "workflow_instances" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_instances_org_review_status_idx" ON "workflow_instances" USING btree ("org_id","review_status");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_suites_org_name_unique" ON "workflow_suites" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "workflow_suites_org_id_idx" ON "workflow_suites" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_org_name_unique" ON "workflows" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "workflows_org_id_idx" ON "workflows" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "workflows_suite_id_idx" ON "workflows" USING btree ("suite_id");--> statement-breakpoint
CREATE INDEX "workflows_org_category_idx" ON "workflows" USING btree ("org_id","category");--> statement-breakpoint
CREATE INDEX "assurance_results_suite_id_idx" ON "assurance_results" USING btree ("suite_id");--> statement-breakpoint
CREATE INDEX "assurance_results_org_suite_idx" ON "assurance_results" USING btree ("org_id","suite_id");--> statement-breakpoint
ALTER TABLE "environments" DROP COLUMN "suite_id";