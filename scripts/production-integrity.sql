SELECT name FROM d1_migrations ORDER BY id;

SELECT kind, status, COUNT(*) AS records
FROM content_records
GROUP BY kind, status
ORDER BY kind, status;

SELECT COUNT(*) AS total_content_records FROM content_records;
SELECT COUNT(*) AS field_provenance_rows FROM field_provenance;

SELECT name, passed
FROM migration_0007_assertions
ORDER BY name;

SELECT name, passed
FROM migration_0008_assertions
ORDER BY name;

SELECT name, passed
FROM migration_0009_assertions
ORDER BY name;

SELECT name, passed
FROM migration_0010_assertions
ORDER BY name;

SELECT name, passed
FROM migration_0011_assertions
ORDER BY name;

SELECT name, passed
FROM migration_0012_assertions
ORDER BY name;

SELECT
  (SELECT COUNT(*) FROM "user") AS ordinary_auth_users,
  (SELECT COUNT(*) FROM ordinary_account_profiles) AS ordinary_profiles,
  (SELECT COUNT(*) FROM ordinary_adult_eligibility) AS retained_adult_eligibility_rows,
  (SELECT COUNT(*) FROM ordinary_account_lifecycles) AS ordinary_lifecycle_rows,
  (SELECT COUNT(*) FROM ordinary_account_notice_deliveries WHERE state = 'permanent-failure') AS permanent_warning_failures,
  (SELECT COUNT(*) FROM ordinary_account_lifecycles
    WHERE confirmed_delivery_at IS NULL AND deletion_due_at IS NOT NULL) AS invalid_unconfirmed_deletion_deadlines,
  NOT EXISTS (
    SELECT 1 FROM pragma_table_info('ordinary_account_profiles') field
    WHERE lower(field.name) LIKE '%birth%year%' OR lower(field.name) LIKE '%birth%date%'
  ) AS ordinary_profiles_exclude_birth_year,
  NOT EXISTS (
    SELECT 1 FROM pragma_table_info('public_outpost_directory') field
    WHERE lower(field.name) IN ('email', 'auth_user_id', 'profile', 'claimed_position', 'eligibility', 'session', 'token')
  ) AS public_directory_excludes_ordinary_account_fields;

SELECT
  (SELECT COUNT(*) FROM maintenance_jobs) AS maintenance_job_count,
  (SELECT COUNT(DISTINCT job_key) FROM maintenance_jobs) AS distinct_maintenance_job_count,
  (SELECT COUNT(*) FROM approved_source_monitors WHERE enabled = 1) AS enabled_source_monitors,
  NOT EXISTS (
    SELECT 1 FROM system_maintenance_events event
    JOIN maintenance_runs run ON run.id = event.maintenance_run_id
    WHERE run.trigger_type = 'cron' AND run.operator_tenure_id IS NOT NULL
  ) AS cron_never_forges_operator_tenure,
  NOT EXISTS (
    SELECT 1 FROM automated_source_observations observation
    WHERE observation.bounded_byte_count < 0 OR observation.bounded_byte_count > 262144
  ) AS source_observations_remain_bounded;

SELECT
  (SELECT COUNT(*) FROM operator_account) AS operator_account_rows,
  (SELECT COUNT(*) FROM operator_tenures WHERE ended_at IS NULL) AS open_operator_tenures,
  (((SELECT state FROM operator_account WHERE singleton_key = 1) = 'unclaimed'
      AND (SELECT COUNT(*) FROM operator_tenures WHERE ended_at IS NULL) = 0)
    OR ((SELECT state FROM operator_account WHERE singleton_key = 1) = 'active'
      AND (SELECT COUNT(*) FROM operator_tenures WHERE ended_at IS NULL) = 1
      AND EXISTS (SELECT 1 FROM operator_account account JOIN operator_tenures tenure
        ON tenure.tenure_number = account.active_tenure_number AND tenure.ended_at IS NULL
        WHERE account.singleton_key = 1))) AS active_tenure_invariant,
  (SELECT COUNT(*) FROM operator_transfers WHERE state = 'pending') AS pending_operator_transfers,
  NOT EXISTS (
    SELECT 1 FROM sqlite_schema schema, pragma_table_info(schema.name) column_info
    WHERE schema.type = 'table'
      AND (lower(column_info.name) LIKE '%birth%year%' OR lower(column_info.name) LIKE '%birth%date%')
  ) AS no_birth_columns;

SELECT
  (SELECT COUNT(*) FROM public_search_documents) AS public_search_documents,
  (SELECT COUNT(*) FROM content_records WHERE status = 'published') AS published_content_records,
  NOT EXISTS (
    SELECT 1
    FROM public_search_documents search
    JOIN content_records content ON content.id = search.content_id
    WHERE content.status <> 'published'
  ) AS public_search_contains_only_published;

SELECT
  (SELECT COUNT(*) FROM public_eligible_outposts) AS verified_public_outposts,
  (SELECT COUNT(*) FROM public_jurisdiction_coverage) AS us_jurisdictions,
  NOT EXISTS (
    SELECT 1 FROM public_eligible_outposts eligible JOIN outpost_lifecycle lifecycle
      ON lifecycle.outpost_id = eligible.content_id
    WHERE lifecycle.state NOT IN ('verified', 'grace')
  ) AS public_outposts_are_lifecycle_eligible,
  NOT EXISTS (
    SELECT 1 FROM sqlite_schema schema, pragma_table_info(schema.name) field
    WHERE schema.type IN ('table', 'view') AND schema.name LIKE 'public_%'
      AND lower(field.name) IN ('reply_email', 'private_notes', 'reference_code', 'challenge_token')
  ) AS public_schema_excludes_submission_private_fields;

PRAGMA foreign_key_check;
