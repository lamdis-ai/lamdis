import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://lamdis:xirorH4NU7mI9iHLlxQ7VSPno@lamdis-prod.cazwh8mlv3ad.us-east-1.rds.amazonaws.com:5432/lamdis?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

const statements = [
  // =========================================================================
  // MISSING COLUMNS
  // =========================================================================

  // test_suites: add "disabled" column
  `ALTER TABLE test_suites ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT FALSE`,

  // assurance_results: add "suite_id" column (nullable UUID, references assurance_suites)
  `ALTER TABLE assurance_results ADD COLUMN IF NOT EXISTS suite_id UUID REFERENCES assurance_suites(id)`,

  // =========================================================================
  // MISSING INDEXES
  // =========================================================================

  // test_folders
  `CREATE INDEX IF NOT EXISTS test_folders_parent_id_idx ON test_folders (parent_id)`,

  // tests
  `CREATE INDEX IF NOT EXISTS tests_org_suite_ids_idx ON tests (org_id)`,

  // test_runs
  `CREATE INDEX IF NOT EXISTS test_runs_org_status_idx ON test_runs (org_id, status)`,
  `CREATE INDEX IF NOT EXISTS test_runs_org_created_idx ON test_runs (org_id, created_at)`,

  // assurance_tests
  `CREATE UNIQUE INDEX IF NOT EXISTS assurance_tests_org_suite_name_unique ON assurance_tests (org_id, suite_id, name)`,
  `CREATE INDEX IF NOT EXISTS assurance_tests_suite_id_idx ON assurance_tests (suite_id)`,

  // assurance_results
  `CREATE INDEX IF NOT EXISTS assurance_results_suite_id_idx ON assurance_results (suite_id)`,
  `CREATE INDEX IF NOT EXISTS assurance_results_org_status_idx ON assurance_results (org_id, status)`,
  `CREATE INDEX IF NOT EXISTS assurance_results_org_suite_status_idx ON assurance_results (org_id, suite_id, status)`,
  `CREATE INDEX IF NOT EXISTS assurance_results_org_suite_received_idx ON assurance_results (org_id, suite_id, received_at)`,

  // evidence_vault_entries (schema name differs from prod name)
  `CREATE INDEX IF NOT EXISTS evidence_vault_entries_model_id_idx ON evidence_vault_entries (evidence_model_id)`,
  `CREATE INDEX IF NOT EXISTS evidence_vault_entries_org_flagged_idx ON evidence_vault_entries (org_id, flagged_for_review)`,

  // test_packs
  `CREATE INDEX IF NOT EXISTS test_packs_featured_idx ON test_packs (is_featured)`,

  // installed_packs (prod has installed_packs_org_pack_unique, schema wants installed_packs_org_pack_slug_unique)
  `CREATE UNIQUE INDEX IF NOT EXISTS installed_packs_org_pack_slug_unique ON installed_packs (org_id, pack_slug)`,

  // setups (prod has setups_org_suite_idx/setups_org_env_idx, schema wants setups_org_suite_id_idx/setups_org_environment_id_idx)
  `CREATE INDEX IF NOT EXISTS setups_org_suite_id_idx ON setups (org_id, suite_id)`,
  `CREATE INDEX IF NOT EXISTS setups_org_environment_id_idx ON setups (org_id, environment_id)`,
];

console.log(`Running ${statements.length} migration statements against production...\n`);

let success = 0;
let failed = 0;

for (const sql of statements) {
  try {
    await pool.query(sql);
    console.log(`OK: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`);
    success++;
  } catch (err) {
    // For unique indexes, if there are duplicate rows it will fail — report but continue
    console.error(`FAIL: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`);
    console.error(`  Error: ${err.message}\n`);
    failed++;
  }
}

console.log(`\nDone. ${success} succeeded, ${failed} failed.`);
await pool.end();
