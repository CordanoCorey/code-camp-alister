import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const migrationNames = [
  '0001_initial.sql',
  '0002_directory_foundation.sql',
  '0003_outpost_source_freshness.sql',
  '0004_victory_outpost.sql',
  '0005_advancement_library.sql',
  '0006_events_and_freshness.sql',
  '0007_normalized_content_model.sql',
  '0008_operator_lifecycle.sql',
  '0009_us_directory_operations.sql',
  '0010_automated_data_maintenance.sql',
  '0011_ordinary_adult_accounts.sql',
  '0012_ordinary_account_lifecycle.sql',
  '0013_international_directory_foundation.sql',
  '0014_membership_and_permissions.sql',
  '0015_outpost_workspace_calendar.sql',
  '0016_reference_event_outpost_plans.sql',
]
const temporary = await mkdtemp(join(tmpdir(), 'ranger-outpost-migrations-'))
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

async function findSqlites(directory) {
  const matches = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      matches.push(...await findSqlites(path))
    } else if (entry.name.endsWith('.sqlite')) matches.push(path)
  }
  return matches
}

function apply(config, state) {
  const result = spawnSync(npx, ['wrangler', 'd1', 'migrations', 'apply', 'ranger-outpost-hub',
    '--config', config, '--local', '--persist-to', state], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) throw new Error(`${result.error?.message ?? ''}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`)
}

function assertDatabase(path, scenario) {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    const failedAssertions = db.prepare('SELECT name FROM migration_0007_assertions WHERE passed <> 1').all()
    const failedLifecycleAssertions = db.prepare('SELECT name FROM migration_0008_assertions WHERE passed <> 1').all()
    const failedDirectoryAssertions = db.prepare('SELECT name FROM migration_0009_assertions WHERE passed <> 1').all()
    const failedMaintenanceAssertions = db.prepare('SELECT name FROM migration_0010_assertions WHERE passed <> 1').all()
    const failedAccountAssertions = db.prepare('SELECT name FROM migration_0011_assertions WHERE passed <> 1').all()
    const failedOrdinaryLifecycleAssertions = db.prepare('SELECT name FROM migration_0012_assertions WHERE passed <> 1').all()
    const failedInternationalAssertions = db.prepare('SELECT name FROM migration_0013_assertions WHERE passed <> 1').all()
    const failedMembershipAssertions = db.prepare('SELECT name FROM migration_0014_assertions WHERE passed <> 1').all()
    const failedWorkspaceAssertions = db.prepare('SELECT name FROM migration_0015_assertions WHERE passed <> 1').all()
    const failedReferencePlanAssertions = db.prepare('SELECT name FROM migration_0016_assertions WHERE passed <> 1').all()
    const foreignKeys = db.prepare('PRAGMA foreign_key_check').all()
    const duplicateSlugs = Number(db.prepare('SELECT COUNT(*) count FROM (SELECT slug FROM content_records GROUP BY slug HAVING COUNT(*) > 1)').get().count)
    const parity = db.prepare(`SELECT
      (SELECT COUNT(*) FROM content_records WHERE kind = 'outpost') = (SELECT COUNT(*) FROM outposts) outposts,
      (SELECT COUNT(*) FROM content_records WHERE kind = 'event') = (SELECT COUNT(*) FROM event_occurrences) events,
      (SELECT COUNT(*) FROM content_records WHERE kind = 'advancement') = (SELECT COUNT(*) FROM advancement_items) advancement,
      (SELECT COUNT(*) FROM content_records WHERE kind = 'organization') = (SELECT COUNT(*) FROM organization_units) organizations,
      (SELECT COUNT(*) FROM content_records WHERE kind = 'page') = (SELECT COUNT(*) FROM information_pages) pages,
      (SELECT COUNT(*) FROM record_sources) <= (SELECT COUNT(*) FROM field_provenance) provenance,
      NOT EXISTS (SELECT 1 FROM record_sources legacy LEFT JOIN field_provenance normalized ON normalized.id = legacy.id
        WHERE normalized.id IS NULL OR normalized.content_id <> legacy.record_id OR normalized.field_path <> legacy.field_name
          OR normalized.source_label <> legacy.label OR normalized.verified_at <> legacy.verified_at) source_values,
      NOT EXISTS (SELECT 1 FROM content_records legacy JOIN outposts normalized ON normalized.content_id = legacy.id
        JOIN civil_geographies geography ON geography.id = normalized.civil_geography_id
        WHERE legacy.kind = 'outpost' AND (normalized.hub_outpost_id <> json_extract(legacy.details_json, '$.hubOutpostId')
          OR normalized.church <> json_extract(legacy.details_json, '$.church')
          OR normalized.city <> json_extract(legacy.details_json, '$.city')
          OR geography.name <> json_extract(legacy.details_json, '$.jurisdiction'))) outpost_values,
      NOT EXISTS (SELECT 1 FROM content_records legacy JOIN event_occurrences normalized ON normalized.content_id = legacy.id
        WHERE legacy.kind = 'event' AND (normalized.occurrence_id <> json_extract(legacy.details_json, '$.occurrenceId')
          OR normalized.start_date <> json_extract(legacy.details_json, '$.startDate')
          OR normalized.official_url <> json_extract(legacy.details_json, '$.officialUrl'))) event_values,
      NOT EXISTS (SELECT 1 FROM content_records legacy JOIN advancement_items normalized ON normalized.content_id = legacy.id
        WHERE legacy.kind = 'advancement' AND (normalized.subtype <> json_extract(legacy.details_json, '$.subtype')
          OR normalized.official_url <> json_extract(legacy.details_json, '$.officialUrl'))) advancement_values,
      NOT EXISTS (SELECT 1 FROM public_search_documents search JOIN content_records content ON content.id = search.content_id
        WHERE content.status <> 'published') public_search_only`).get()
    const failures = Object.entries(parity).filter(([, passed]) => passed !== 1).map(([name]) => name)
    const operatorInvariant = db.prepare(`SELECT
      (SELECT COUNT(*) FROM operator_account) = 1 singleton,
      ((SELECT state FROM operator_account WHERE singleton_key = 1) = 'unclaimed'
        AND (SELECT COUNT(*) FROM operator_tenures WHERE ended_at IS NULL) = 0)
      OR ((SELECT state FROM operator_account WHERE singleton_key = 1) = 'active'
        AND (SELECT COUNT(*) FROM operator_tenures WHERE ended_at IS NULL) = 1
        AND EXISTS (SELECT 1 FROM operator_account account JOIN operator_tenures tenure
          ON tenure.tenure_number = account.active_tenure_number AND tenure.ended_at IS NULL
          WHERE account.singleton_key = 1)) active_tenure_invariant,
      (SELECT COUNT(*) FROM operator_transfers WHERE state = 'pending') <= 1 pending_transfer,
      NOT EXISTS (SELECT 1 FROM sqlite_schema schema, pragma_table_info(schema.name) column_info
        WHERE schema.type = 'table' AND (lower(column_info.name) LIKE '%birth%year%'
          OR lower(column_info.name) LIKE '%birth%date%')) no_birth_columns`).get()
    const operatorFailures = Object.entries(operatorInvariant).filter(([, passed]) => passed !== 1).map(([name]) => name)
    const directEmailBypassBlocked = (() => {
      try {
        db.prepare(`UPDATE operator_account SET state = 'active', display_name = 'Verifier',
          verified_email = 'verifier@example.org', active_tenure_number = 1,
          eligibility_confirmed = 1, eligibility_confirmed_at = '2026-08-13T00:00:00.000Z',
          attestation_version = 'operator-adult-v1', activated_at = '2026-08-13T00:00:00.000Z',
          renewal_due_at = '2030-08-13T00:00:00.000Z', version = 1 WHERE singleton_key = 1`).run()
        db.prepare(`UPDATE operator_account SET verified_email = 'bypass@example.org', version = version + 1
          WHERE singleton_key = 1`).run()
        return false
      } catch {
        return true
      }
    })()
    if (!directEmailBypassBlocked) operatorFailures.push('direct_email_bypass')
    const accountInvariant = db.prepare(`SELECT
      (SELECT COUNT(*) FROM "user") = 0 zero_seeded_ordinary_accounts,
      (SELECT COUNT(*) FROM ordinary_account_profiles) = 0 zero_seeded_profiles,
      NOT EXISTS (SELECT 1 FROM sqlite_schema schema, pragma_table_info(schema.name) column_info
        WHERE schema.type = 'table' AND (lower(column_info.name) LIKE '%birth%year%'
          OR lower(column_info.name) LIKE '%birth%date%')) no_birth_columns,
      NOT EXISTS (SELECT 1 FROM sqlite_schema schema, pragma_table_info(schema.name) field
        WHERE schema.name LIKE 'public_%' AND lower(field.name) IN
          ('email', 'auth_user_id', 'profile', 'claimed_position', 'eligibility', 'session', 'token')) public_schema_is_private`).get()
    const accountFailures = Object.entries(accountInvariant).filter(([, passed]) => passed !== 1).map(([name]) => name)
    if (scenario === 'upgrade-from-0011') {
      const preservedMaintenance = db.prepare(`SELECT
        EXISTS (SELECT 1 FROM automation_alerts WHERE id = 'migration-upgrade-alert') alert,
        EXISTS (SELECT 1 FROM system_maintenance_events WHERE id = 'migration-upgrade-event') event,
        EXISTS (SELECT 1 FROM maintenance_daily_aggregates
          WHERE aggregate_date = '2026-08-12' AND job_key = 'listing-lifecycle') aggregate`).get()
      accountFailures.push(...Object.entries(preservedMaintenance)
        .filter(([, preserved]) => preserved !== 1).map(([name]) => `maintenance_${name}_not_preserved`))
    }
    if (failedAssertions.length || failedLifecycleAssertions.length || failedDirectoryAssertions.length || failedMaintenanceAssertions.length || failedAccountAssertions.length || failedOrdinaryLifecycleAssertions.length || failedInternationalAssertions.length || failedMembershipAssertions.length || failedWorkspaceAssertions.length || failedReferencePlanAssertions.length || foreignKeys.length || duplicateSlugs || failures.length || operatorFailures.length || accountFailures.length) {
      throw new Error(`${scenario} integrity failed: ${JSON.stringify({ failedAssertions, failedLifecycleAssertions, failedDirectoryAssertions, failedMaintenanceAssertions, failedAccountAssertions, failedOrdinaryLifecycleAssertions, failedInternationalAssertions, failedMembershipAssertions, failedWorkspaceAssertions, failedReferencePlanAssertions, foreignKeys, duplicateSlugs, failures, operatorFailures, accountFailures })}`)
    }
    return {
      scenario,
      records: Number(db.prepare('SELECT COUNT(*) count FROM content_records').get().count),
      provenance: Number(db.prepare('SELECT COUNT(*) count FROM field_provenance').get().count),
      assertions: Number(db.prepare('SELECT COUNT(*) count FROM migration_0007_assertions').get().count),
      lifecycleAssertions: Number(db.prepare('SELECT COUNT(*) count FROM migration_0008_assertions').get().count),
      directoryAssertions: Number(db.prepare('SELECT COUNT(*) count FROM migration_0009_assertions').get().count),
      maintenanceAssertions: Number(db.prepare('SELECT COUNT(*) count FROM migration_0010_assertions').get().count),
      accountAssertions: Number(db.prepare('SELECT COUNT(*) count FROM migration_0011_assertions').get().count),
      ordinaryLifecycleAssertions: Number(db.prepare('SELECT COUNT(*) count FROM migration_0012_assertions').get().count),
      internationalAssertions: Number(db.prepare('SELECT COUNT(*) count FROM migration_0013_assertions').get().count),
      membershipAssertions: Number(db.prepare('SELECT COUNT(*) count FROM migration_0014_assertions').get().count),
      workspaceAssertions: Number(db.prepare('SELECT COUNT(*) count FROM migration_0015_assertions').get().count),
      referencePlanAssertions: Number(db.prepare('SELECT COUNT(*) count FROM migration_0016_assertions').get().count),
    }
  } finally {
    db.close()
  }
}

async function scenario(name, staged) {
  const directory = join(temporary, name)
  const migrations = join(directory, 'migrations')
  const state = join(directory, 'state')
  const config = join(directory, 'wrangler.jsonc')
  await mkdir(migrations, { recursive: true })
  await mkdir(state, { recursive: true })
  await writeFile(config, JSON.stringify({
    name: `ranger-outpost-${name}`,
    main: join(root, 'worker', 'index.ts'),
    compatibility_date: '2026-08-12',
    d1_databases: [{ binding: 'DB', database_name: 'ranger-outpost-hub', database_id: '00000000-0000-0000-0000-000000000000', migrations_dir: './migrations' }],
  }))
  const initial = staged ? migrationNames.slice(0, 14) : migrationNames
  for (const name of initial) await copyFile(join(root, 'migrations', name), join(migrations, basename(name)))
  apply(config, state)
  if (staged) {
    const stagedCandidates = await findSqlites(state)
    const stagedDatabase = stagedCandidates.find((path) => {
      const candidate = new DatabaseSync(path, { readOnly: true })
      try {
        return Boolean(candidate.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'migration_0011_assertions'").get())
      } finally {
        candidate.close()
      }
    })
    if (!stagedDatabase) throw new Error(`${name} could not locate the staged 0014 database.`)
    const db = new DatabaseSync(stagedDatabase)
    try {
      db.exec(`INSERT INTO maintenance_runs
        (id, trigger_type, dispatcher_rule_version, status, started_at, completed_at)
        VALUES ('migration-upgrade-run', 'local-test', 'maintenance-dispatcher-v1', 'succeeded',
          '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:01.000Z');
        INSERT INTO automation_alerts
          (id, maintenance_run_id, rule_version, actor_label, alert_type, severity, job_key,
           source_document_id, coalescing_key, summary, status, first_seen_at, last_seen_at)
        VALUES ('migration-upgrade-alert', 'migration-upgrade-run', 'listing-lifecycle-v1',
          'Automation: listing-lifecycle-v1', 'backlog-threshold', 'warning', 'listing-lifecycle',
          NULL, 'migration-upgrade-alert', 'Migration upgrade preservation fixture.', 'open',
          '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z');
        INSERT INTO system_maintenance_events
          (id, maintenance_run_id, job_key, rule_version, idempotency_key, target_type, target_id,
           action, reason, actor_label, created_at)
        VALUES ('migration-upgrade-event', 'migration-upgrade-run', 'listing-lifecycle',
          'listing-lifecycle-v1', 'migration-upgrade-event', 'outpost', 'migration-fixture',
          'fixture-preservation', 'Migration upgrade preservation fixture.',
          'Automation: listing-lifecycle-v1', '2026-08-12T00:00:00.000Z');
        INSERT INTO maintenance_daily_aggregates
          (aggregate_date, job_key, successful_runs, updated_at)
        VALUES ('2026-08-12', 'listing-lifecycle', 1, '2026-08-12T00:00:00.000Z');`)
    } finally {
      db.close()
    }
    for (const migrationName of migrationNames.slice(14)) {
      await copyFile(join(root, 'migrations', migrationName), join(migrations, migrationName))
    }
    apply(config, state)
  }
  const candidates = await findSqlites(state)
  const sqlite = candidates.find((path) => {
    const candidate = new DatabaseSync(path, { readOnly: true })
    try {
      return Boolean(candidate.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'migration_0013_assertions'").get())
    } finally {
      candidate.close()
    }
  })
  if (!sqlite) throw new Error(`${name} did not create an isolated migrated SQLite database. Candidates: ${candidates.join(', ')}`)
  return assertDatabase(sqlite, name)
}

try {
  const results = [
    await scenario('upgrade-from-0014', true),
    await scenario('fresh-through-0016', false),
  ]
  console.log(JSON.stringify({ isolated: true, results }, null, 2))
} finally {
  await rm(temporary, { recursive: true, force: true })
}
