import { afterEach, expect, test } from 'vitest'
import worker from './index'
import { createMigratedD1 } from './test-sqlite-d1'

const openDatabases: Array<ReturnType<typeof createMigratedD1>> = []
afterEach(() => { while (openDatabases.length) openDatabases.pop()?.close() })

test('scheduled handler dispatches bounded maintenance through waitUntil', async () => {
  const migrated = createMigratedD1()
  openDatabases.push(migrated)
  migrated.sqlite.prepare('UPDATE maintenance_jobs SET enabled = 0').run()
  const promises: Promise<unknown>[] = []
  const context = { waitUntil(promise: Promise<unknown>) { promises.push(promise) } } as ExecutionContext
  worker.scheduled?.(
    { cron: '7,37 * * * *', scheduledTime: Date.parse('2026-08-13T12:07:00.000Z'), type: 'scheduled' } as ScheduledController,
    { DB: migrated.db } as never,
    context,
  )

  expect(promises).toHaveLength(1)
  await expect(promises[0]).resolves.toMatchObject({ jobsClaimed: 0, failedTasks: 0 })
  expect(migrated.sqlite.prepare(`SELECT trigger_type, operator_tenure_id, status
    FROM maintenance_runs ORDER BY started_at DESC LIMIT 1`).get()).toEqual({
    trigger_type: 'cron', operator_tenure_id: null, status: 'succeeded',
  })
})

test('scheduled handler fails safely when maintenance schema is missing', async () => {
  const promises: Promise<unknown>[] = []
  const context = { waitUntil(promise: Promise<unknown>) { promises.push(promise) } } as ExecutionContext
  worker.scheduled?.(
    { cron: '7,37 * * * *', scheduledTime: Date.parse('2026-08-13T12:07:00.000Z'), type: 'scheduled' } as ScheduledController,
    { DB: { prepare() { throw new Error('missing schema detail must stay private') } } } as never,
    context,
  )
  expect(promises).toHaveLength(1)
  await expect(promises[0]).rejects.toThrow('Scheduled maintenance failed safely.')
})
