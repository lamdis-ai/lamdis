-- Migration: Drop assurance system
-- Deploy order: Code first → verify all healthy → run migration → verify again

DROP TABLE IF EXISTS assurance_results;
DROP TABLE IF EXISTS assurance_tests;
DROP TABLE IF EXISTS assurance_suites;

ALTER TABLE organizations DROP COLUMN IF EXISTS assurance_plan;
ALTER TABLE organizations DROP COLUMN IF EXISTS assurance_subscription_status;
ALTER TABLE organizations DROP COLUMN IF EXISTS assurance_seat_allocation;
ALTER TABLE organizations DROP COLUMN IF EXISTS assurance_free_trial_started_at;
ALTER TABLE organizations DROP COLUMN IF EXISTS assurance_free_trial_ends_at;
ALTER TABLE organizations DROP COLUMN IF EXISTS assurance_free_trial_activated;

-- Add new workflow columns (from phases 2-3)
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS webhook jsonb;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS webhook_secondary jsonb;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS storage_mode text DEFAULT 'standard';
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS vault jsonb;

ALTER TABLE workflow_instances ADD COLUMN IF NOT EXISTS storage_mode text;
ALTER TABLE workflow_instances ADD COLUMN IF NOT EXISTS vault jsonb;
ALTER TABLE workflow_instances ADD COLUMN IF NOT EXISTS trace_pointer jsonb;
