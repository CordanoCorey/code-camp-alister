import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import worker from './index'
import { createMigratedD1 } from './test-sqlite-d1'

describe('private Automation workspace HTTP seam', () => {
  let migrated: ReturnType<typeof createMigratedD1>
  const environment = () => ({
    ASSETS: { fetch: async () => new Response('asset') }, DB: migrated.db,
    LOCAL_OPERATOR_PREVIEW: 'true',
  } as never)
  const call = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`http://localhost${path}`, init), environment())

  beforeEach(async () => {
    migrated = createMigratedD1()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T12:00:00.000Z'))
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await call('/api/operator/account/claim', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Operator', currentOutpostId: null, birthYear: '2000', adultAttestation: true }),
    })
  })

  afterEach(() => {
    migrated.close()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('active Operator can view and run only due bounded maintenance', async () => {
    migrated.sqlite.prepare('UPDATE maintenance_jobs SET enabled = 0').run()
    const workspace = await call('/api/operator/automation')
    expect(workspace.status).toBe(200)
    expect(workspace.headers.get('cache-control')).toBe('no-store')
    const firstPage = await workspace.json() as { readOnly: boolean; scheduler: { dueJobCount: number }
      jobs: unknown[]; availableSources: Array<{ id: string }>; pagination: { availableSources: string | null } }
    expect(firstPage).toMatchObject({ readOnly: false, scheduler: { dueJobCount: 0 }, jobs: expect.any(Array) })
    expect(firstPage.availableSources).toHaveLength(20)
    expect(firstPage.pagination.availableSources).toEqual(expect.any(String))
    const nextPage = await call(`/api/operator/automation?queue=availableSources&cursor=${encodeURIComponent(firstPage.pagination.availableSources!)}`)
    expect(nextPage.status).toBe(200)
    const nextWorkspace = await nextPage.json() as { availableSources: Array<{ id: string }> }
    expect(nextWorkspace.availableSources.length).toBeGreaterThan(0)
    expect(nextWorkspace.availableSources.some((source) => firstPage.availableSources.some((first) => first.id === source.id))).toBe(false)

    const run = await call('/api/operator/automation/run', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmed: true }),
    })
    expect(run.status).toBe(200)
    expect(await run.json()).toMatchObject({ status: 'succeeded', jobsClaimed: 0 })
    expect(migrated.sqlite.prepare(`SELECT trigger_type, operator_tenure_id
      FROM maintenance_runs ORDER BY started_at DESC LIMIT 1`).get()).toEqual({
      trigger_type: 'operator-run-now', operator_tenure_id: 1,
    })

    migrated.sqlite.prepare(`UPDATE maintenance_jobs SET circuit_state = 'open', consecutive_failures = 5
      WHERE job_key = 'event-completion'`).run()
    const reset = await call('/api/operator/automation/jobs/event-completion/circuit', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'The reviewed invariant failure was corrected.' }),
    })
    expect(reset.status).toBe(200)
    expect(migrated.sqlite.prepare(`SELECT circuit_state, consecutive_failures FROM maintenance_jobs
      WHERE job_key = 'event-completion'`).get()).toEqual({ circuit_state: 'closed', consecutive_failures: 0 })
  })

  test('renewal-required Operator sees compact read-only health but cannot mutate', async () => {
    migrated.sqlite.prepare(`UPDATE operator_account SET renewal_due_at = '2026-08-13T11:59:59.000Z',
      version = version + 1 WHERE singleton_key = 1`).run()
    const workspace = await call('/api/operator/automation')
    expect(workspace.status).toBe(200)
    expect(await workspace.json()).toMatchObject({ readOnly: true, monitors: [], candidates: [], availableSources: [] })
    const run = await call('/api/operator/automation/run', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmed: true }),
    })
    expect(run.status).toBe(423)
    const reset = await call('/api/operator/automation/jobs/event-completion/circuit', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'Blocked.' }),
    })
    expect(reset.status).toBe(423)
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM maintenance_runs').get()).toEqual({ count: 0 })
  })

  test('unauthorized request cannot read Automation state', async () => {
    const response = await worker.fetch(new Request('https://hub.example/api/operator/automation'), {
      ...environment(), LOCAL_OPERATOR_PREVIEW: undefined,
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
