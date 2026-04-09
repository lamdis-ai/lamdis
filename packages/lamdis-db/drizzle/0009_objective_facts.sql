-- Add current_facts column to outcome_instances for structured fact tracking
ALTER TABLE outcome_instances ADD COLUMN IF NOT EXISTS current_facts jsonb DEFAULT '{}';
