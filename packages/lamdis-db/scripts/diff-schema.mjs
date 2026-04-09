import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://lamdis:xirorH4NU7mI9iHLlxQ7VSPno@lamdis-prod.cazwh8mlv3ad.us-east-1.rds.amazonaws.com:5432/lamdis?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

const tables = ['test_suites','test_folders','tests','test_runs','assurance_suites','assurance_tests','assurance_results','evidence_models','evidence_vault_entries','test_packs','pack_tests','installed_packs','setups'];
const tableList = tables.map(t => `'${t}'`).join(',');

const [colRes, idxRes] = await Promise.all([
  pool.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN (${tableList}) ORDER BY table_name, ordinal_position`),
  pool.query(`SELECT indexname, tablename FROM pg_indexes WHERE schemaname='public' AND tablename IN (${tableList}) ORDER BY tablename, indexname`)
]);

const colsByTable = {};
for (const r of colRes.rows) {
  if (!colsByTable[r.table_name]) colsByTable[r.table_name] = new Set();
  colsByTable[r.table_name].add(r.column_name);
}
const existingIndexes = new Set(idxRes.rows.map(r => r.indexname));

const schemaColumns = {
  test_suites: ['id','org_id','name','description','tags','default_env_id','default_connection_key','default_setup_id','selected_conn_keys','schedule','thresholds','labels','disabled','created_by','created_at','updated_at'],
  test_folders: ['id','org_id','name','description','parent_id','color','order','created_at','updated_at'],
  tests: ['id','org_id','suite_id','suite_ids','folder_id','name','target','persona_id','script','pre_steps','steps','variables','objective','iterate','max_turns','min_turns','continue_after_pass','judge_config','assertions','confirmations','labels','disabled','created_at','updated_at'],
  test_runs: ['id','org_id','suite_id','trigger','git_context','env_id','connection_key','status','started_at','finished_at','totals','summary_score','progress','items','stop_requested','error','created_at','updated_at'],
  assurance_suites: ['id','org_id','name','description','tags','mode','webhook','webhook_secondary','thresholds','vault','labels','created_by','disabled','created_at','updated_at'],
  assurance_tests: ['id','org_id','suite_id','suite_ids','name','description','category','assertions','on_pass','on_fail','filter','judge_threshold','labels','disabled','created_at','updated_at'],
  assurance_results: ['id','org_id','suite_id','trace_id','correlation_id','session_id','status','totals','results','trace','webhooks_fired','received_at','evaluated_at','completed_at','processing_ms','evaluated_by','storage_mode','trace_pointer','submitted_trace_hash_sha256','derived_evidence','vault','review_status','comments','status_history','review','tags','created_at','updated_at'],
  evidence_models: ['id','org_id','name','description','data_schema','examples','webhook','vault','tags','created_by','disabled','created_at','updated_at'],
  evidence_vault_entries: ['id','org_id','evidence_model_id','data','storage_mode','artifact_pointer','submitted_data_hash_sha256','derived_evidence','reasoning_summary','status','validation','processing','overall_result','test_summary','test_results','evaluated_at','source','tags','flagged_for_review','reviewed_at','reviewed_by','review_notes','archived','archived_at','scheduled_deletion_at','created_at','updated_at'],
  test_packs: ['id','slug','name','description','long_description','version','framework_slugs','industries','use_cases','tags','icon_url','cover_image_url','pricing','status','install_count','is_featured','display_order','default_thresholds','test_count','created_by','last_updated_by','release_notes','changelog','created_at','updated_at'],
  pack_tests: ['id','pack_slug','test_key','name','description','category','severity','persona','steps','tags','framework_controls','display_order','is_enabled','created_at','updated_at'],
  installed_packs: ['id','org_id','pack_slug','installed_version','suite_ids','config','installed_by','installed_at','last_updated','status','created_at','updated_at'],
  setups: ['id','org_id','key','name','description','environment_id','assistant_id','suite_id','config','labels','is_default','enabled','created_at','updated_at'],
};

const schemaIndexes = [
  'test_suites_org_name_unique','test_suites_org_id_idx',
  'test_folders_org_name_parent_unique','test_folders_org_id_idx','test_folders_parent_id_idx',
  'tests_org_suite_name_unique','tests_org_id_idx','tests_suite_id_idx','tests_folder_id_idx','tests_org_suite_ids_idx',
  'test_runs_org_id_idx','test_runs_suite_id_idx','test_runs_org_status_idx','test_runs_connection_key_idx','test_runs_org_created_idx',
  'assurance_suites_org_name_unique','assurance_suites_org_id_idx','assurance_suites_org_mode_idx',
  'assurance_tests_org_suite_name_unique','assurance_tests_org_id_idx','assurance_tests_suite_id_idx','assurance_tests_org_category_idx',
  'assurance_results_org_id_idx','assurance_results_suite_id_idx','assurance_results_org_trace_id_unique','assurance_results_org_status_idx','assurance_results_org_suite_status_idx','assurance_results_org_suite_received_idx','assurance_results_org_review_status_idx','assurance_results_org_review_received_idx','assurance_results_correlation_id_idx','assurance_results_session_id_idx',
  'evidence_models_org_name_unique','evidence_models_org_id_idx',
  'evidence_vault_entries_org_id_idx','evidence_vault_entries_model_id_idx','evidence_vault_entries_org_model_created_idx','evidence_vault_entries_org_status_created_idx','evidence_vault_entries_org_result_created_idx','evidence_vault_entries_org_flagged_idx','evidence_vault_entries_org_storage_created_idx','evidence_vault_entries_scheduled_deletion_idx',
  'test_packs_slug_unique','test_packs_status_idx','test_packs_featured_idx',
  'pack_tests_pack_slug_test_key_unique','pack_tests_pack_slug_idx',
  'installed_packs_org_pack_slug_unique','installed_packs_org_id_idx','installed_packs_pack_slug_idx',
  'setups_org_key_unique','setups_org_id_idx','setups_org_suite_id_idx','setups_org_environment_id_idx',
];

console.log('=== MISSING COLUMNS ===');
for (const [table, cols] of Object.entries(schemaColumns)) {
  const existing = colsByTable[table] || new Set();
  const missing = cols.filter(c => !existing.has(c));
  if (missing.length) console.log(`${table}: ${missing.join(', ')}`);
}

console.log('\n=== EXTRA COLUMNS IN PROD ===');
for (const [table, cols] of Object.entries(schemaColumns)) {
  const existing = colsByTable[table] || new Set();
  const schemaSet = new Set(cols);
  const extra = [...existing].filter(c => !schemaSet.has(c));
  if (extra.length) console.log(`${table}: ${extra.join(', ')}`);
}

console.log('\n=== MISSING INDEXES ===');
schemaIndexes.filter(i => !existingIndexes.has(i)).forEach(i => console.log(i));

console.log('\n=== EXTRA INDEXES IN PROD ===');
const schemaSet = new Set(schemaIndexes);
// Add pkey indexes to expected
tables.forEach(t => schemaSet.add(`${t}_pkey`));
idxRes.rows.filter(r => !schemaSet.has(r.indexname)).forEach(r => console.log(`${r.tablename}: ${r.indexname}`));

await pool.end();
