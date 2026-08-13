import { createMigratedD1 } from '../worker/test-sqlite-d1.ts'
import { runMaintenance } from '../worker/maintenance.ts'

const FIXED_NOW = '2026-08-13T12:00:00.000Z'
const command = process.argv[2]

if (!['run', 'status'].includes(command)) {
  console.error('Use "run" or "status". This command always uses a fresh in-memory D1 fixture and no network.')
  process.exitCode = 1
} else {
  const migrated = createMigratedD1()
  try {
    if (command === 'run') {
      let id = 0
      const outcome = await runMaintenance({
        db: migrated.db,
        now: () => new Date(FIXED_NOW),
        createId: () => `isolated-local-maintenance-${++id}`,
        fetch: async () => { throw new Error('Isolated local maintenance never contacts the network.') },
      }, { trigger: 'local-test' })
      console.log(JSON.stringify({
        isolatedInMemoryDatabase: true,
        externalRequestsAllowed: false,
        fixedClock: FIXED_NOW,
        outcome,
      }, null, 2))
    } else {
      const jobs = migrated.sqlite.prepare(`SELECT job_key jobKey, enabled, rule_version ruleVersion,
        interval_seconds intervalSeconds, batch_size batchSize, next_due_at nextDueAt,
        circuit_state circuitState FROM maintenance_jobs ORDER BY job_key`).all()
      const sourceMonitors = migrated.sqlite.prepare('SELECT COUNT(*) count FROM approved_source_monitors').get().count
      console.log(JSON.stringify({
        isolatedInMemoryDatabase: true,
        externalRequestsAllowed: false,
        fixedClock: FIXED_NOW,
        sourceMonitors,
        jobs,
      }, null, 2))
    }
  } finally {
    migrated.close()
  }
}
