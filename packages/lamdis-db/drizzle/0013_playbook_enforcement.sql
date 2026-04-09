-- Playbook Runtime Enforcement + Multi-Scope Policies
--
-- 1. action_bindings.connector_instance_id — direct FK so the executor can
--    answer "is this binding's connector bound to the active playbook?"
-- 2. proof_expectations.scope + playbook_id — let policies attach at four
--    scopes: global, outcome_type (current), playbook, category. The
--    outcome_type_id NOT NULL is dropped; a CHECK constraint enforces that
--    exactly the right ref column is set per scope.

-- ============================================================================
-- action_bindings: link to a specific connector instance
-- ============================================================================

ALTER TABLE "action_bindings"
  ADD COLUMN IF NOT EXISTS "connector_instance_id" uuid REFERENCES "connector_instances"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "action_bindings_connector_instance_idx"
  ON "action_bindings" ("connector_instance_id");

-- ============================================================================
-- proof_expectations: multi-scope (global / outcome_type / playbook / category)
-- ============================================================================

-- Drop NOT NULL on outcome_type_id so global/playbook/category-scoped rows
-- don't need a fake outcome type id.
ALTER TABLE "proof_expectations"
  ALTER COLUMN "outcome_type_id" DROP NOT NULL;

-- New scope discriminator (defaults to outcome_type for backfill).
ALTER TABLE "proof_expectations"
  ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'outcome_type';

-- Direct FK to outcome_playbooks for playbook-scoped rules.
ALTER TABLE "proof_expectations"
  ADD COLUMN IF NOT EXISTS "playbook_id" uuid REFERENCES "outcome_playbooks"("id") ON DELETE CASCADE;

-- Backfill is implicit: every existing row keeps scope='outcome_type' via the
-- default. Verify with: SELECT scope, count(*) FROM proof_expectations GROUP BY scope;

-- CHECK constraint: scope dictates which ref column must be set.
-- Use DO block so we can drop and recreate idempotently.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'proof_expectations_scope_check'
  ) THEN
    ALTER TABLE "proof_expectations" DROP CONSTRAINT "proof_expectations_scope_check";
  END IF;
END $$;

ALTER TABLE "proof_expectations"
  ADD CONSTRAINT "proof_expectations_scope_check"
  CHECK (
    (scope = 'global'       AND outcome_type_id IS NULL AND playbook_id IS NULL AND category_id IS NULL) OR
    (scope = 'outcome_type' AND outcome_type_id IS NOT NULL) OR
    (scope = 'playbook'     AND playbook_id     IS NOT NULL) OR
    (scope = 'category'     AND category_id     IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS "proof_expectations_org_scope_idx"
  ON "proof_expectations" ("org_id", "scope");

CREATE INDEX IF NOT EXISTS "proof_expectations_playbook_id_idx"
  ON "proof_expectations" ("playbook_id");
