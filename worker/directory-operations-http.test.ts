import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from './index'
import { createMigratedD1 } from './test-sqlite-d1'
import { readFileSync } from 'node:fs'

const proposal = {
  submissionType: 'new-listing', targetOutpostId: null, church: 'Private Proposal Church',
  outpostNumber: '70', campusSuffix: null, streetAddress: null, city: 'Angleton',
  jurisdiction: 'Texas', postalCode: null, district: 'South Texas District', languageOverlay: null,
  programs: [], meeting: null, sourceUrl: 'https://example.org/rangers',
  fcfActivityStatus: 'not-verified', replyEmail: 'private@example.org', notes: 'Private note',
  privacyConfirmed: true,
}

describe('Operator U.S. directory operations HTTP seam', () => {
  let migrated: ReturnType<typeof createMigratedD1>
  const environment = () => ({
    ASSETS: { fetch: async () => new Response('asset') }, DB: migrated.db,
    LOCAL_OPERATOR_PREVIEW: 'true', LOCAL_PUBLIC_INTAKE_BYPASS: 'true',
    INTAKE_SIGNING_SECRET: 'local-test-signing-secret-with-enough-entropy',
  } as never)
  const call = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`http://localhost${path}`, init), environment())

  beforeEach(() => {
    migrated = createMigratedD1()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T12:00:00.000Z'))
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    migrated.close()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  async function claim() {
    const response = await call('/api/operator/account/claim', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Operator', currentOutpostId: null, birthYear: '2000', adultAttestation: true }),
    })
    expect(response.status).toBe(201)
  }

  async function submit(overrides: Partial<typeof proposal> = {}) {
    const configResponse = await call('/api/public/outpost-submissions/config')
    const config = await configResponse.json() as { timingToken: string }
    vi.advanceTimersByTime(3_000)
    const response = await call('/api/public/outpost-submissions', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ proposal: { ...proposal, ...overrides }, challengeToken: '', timingToken: config.timingToken, website: '' }),
    })
    expect(response.status).toBe(202)
  }

  it('keeps the private queue authorized, bounded, and scrubs terminal PII', async () => {
    await submit()
    const unauthorized = await worker.fetch(new Request('https://hub.example/api/operator/submissions'), {
      ...environment(), LOCAL_OPERATOR_PREVIEW: undefined,
    })
    expect(unauthorized.status).toBe(401)

    await claim()
    const queue = await call('/api/operator/submissions?state=new&jurisdiction=Texas&pageSize=20')
    const queueBody = await queue.json() as { items: Array<{ id: string; church: string }> }
    expect(queueBody.items).toHaveLength(1)
    expect(queueBody.items[0].church).toBe('Private Proposal Church')

    const id = queueBody.items[0].id
    migrated.sqlite.prepare('UPDATE directory_submissions SET retention_deadline = ? WHERE id = ?')
      .run('2026-08-12T00:00:00.000Z', id)
    const retentionQueue = await call('/api/operator/submissions?age=retention-due&pageSize=20')
    expect(await retentionQueue.json()).toMatchObject({ items: [{ id }] })
    const snapshot = await call('/api/operator/snapshot')
    expect(await snapshot.json()).toMatchObject({
      freshnessQueue: expect.arrayContaining([expect.objectContaining({ type: 'submission-retention' })]),
    })
    const detail = await call(`/api/operator/submissions/${id}`)
    expect(await detail.json()).toMatchObject({ item: { replyEmail: 'private@example.org', notes: 'Private note' } })

    const rejected = await call(`/api/operator/submissions/${id}/reject`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'The linked page does not establish current Royal Rangers activity.' }),
    })
    expect(rejected.status).toBe(200)
    expect(migrated.sqlite.prepare(`SELECT state, reply_email, private_notes, pii_scrubbed_at IS NOT NULL scrubbed
      FROM directory_submissions WHERE id = ?`).get(id)).toEqual({
      state: 'rejected', reply_email: null, private_notes: null, scrubbed: 1,
    })
    const audit = JSON.stringify(migrated.sqlite.prepare('SELECT * FROM content_audit_events').all())
    expect(audit).not.toContain('private@example.org')
    expect(audit).not.toContain('Private note')
    const repeated = await call(`/api/operator/submissions/${id}/reject`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'A terminal proposal cannot transition again.' }),
    })
    expect(repeated.status).toBe(400)
  })

  it('converts only verified fields to a canonical audited draft and scrubs PII atomically', async () => {
    await submit()
    await claim()
    const row = migrated.sqlite.prepare('SELECT id FROM directory_submissions').get() as { id: string }
    const ready = await call(`/api/operator/submissions/${row.id}/verified-ready`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Opened and checked the linked first-party page.' }),
    })
    expect(ready.status).toBe(200)

    const converted = await call(`/api/operator/submissions/${row.id}/convert`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        verifiedFields: ['church', 'city', 'jurisdiction', 'outpostNumber'],
        sourceLabel: 'First-party church Royal Rangers page', checkedAt: '2026-08-13',
        reason: 'Created a reviewable draft from the verified identity and scoped number.',
      }),
    })
    expect(converted.status).toBe(201)
    const { id } = await converted.json() as { id: string }
    expect(migrated.sqlite.prepare('SELECT status FROM content_records WHERE id = ?').get(id)).toEqual({ status: 'draft' })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM field_provenance WHERE content_id = ?').get(id)).toEqual({ count: 4 })
    expect(migrated.sqlite.prepare('SELECT state, reply_email, private_notes FROM directory_submissions WHERE id = ?').get(row.id))
      .toEqual({ state: 'converted', reply_email: null, private_notes: null })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM public_search_documents WHERE content_id = ?').get(id)).toEqual({ count: 0 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM public_outpost_directory WHERE content_id = ?').get(id)).toEqual({ count: 0 })
    expect(migrated.sqlite.prepare("SELECT COUNT(*) count FROM content_audit_events WHERE content_id = ? AND actor_label = 'Operator tenure 1'").get(id))
      .toEqual({ count: 1 })
  })

  it('rejects a stale correction and converts the current stable Hub ID without creating a duplicate', async () => {
    await submit({ submissionType: 'correction', targetOutpostId: 'outpost-stx-70' })
    await claim()
    const row = migrated.sqlite.prepare('SELECT id FROM directory_submissions').get() as { id: string }
    const ready = await call(`/api/operator/submissions/${row.id}/verified-ready`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Opened and checked the linked correction source.' }),
    })
    expect(ready.status).toBe(200)
    const target = migrated.sqlite.prepare("SELECT version FROM content_records WHERE id = 'outpost-stx-70'").get() as { version: number }
    const conversion = (expectedVersion: number) => call(`/api/operator/submissions/${row.id}/convert`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        verifiedFields: ['church', 'city', 'jurisdiction', 'outpostNumber'],
        sourceLabel: 'First-party church Royal Rangers page', checkedAt: '2026-08-13',
        reason: 'Convert the reviewed correction to the existing stable listing as a draft.', expectedVersion,
      }),
    })
    const stale = await conversion(target.version + 1)
    expect(stale.status).toBe(409)
    expect(migrated.sqlite.prepare('SELECT state FROM directory_submissions WHERE id = ?').get(row.id))
      .toEqual({ state: 'verified-ready' })
    expect(migrated.sqlite.prepare("SELECT status FROM content_records WHERE id = 'outpost-stx-70'").get())
      .toEqual({ status: 'published' })
    expect(migrated.sqlite.prepare("SELECT version FROM content_records WHERE id = 'outpost-stx-70'").get())
      .toEqual({ version: target.version })

    const converted = await conversion(target.version)
    const convertedBody = await converted.json()
    expect({ status: converted.status, body: convertedBody }).toEqual({
      status: 201, body: { id: 'outpost-stx-70' },
    })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM content_records').get()).toEqual({ count: 146 })
    expect(migrated.sqlite.prepare("SELECT status, version FROM content_records WHERE id = 'outpost-stx-70'").get())
      .toEqual({ status: 'draft', version: target.version + 1 })
  })

  it('turns an overdue unresolved proposal into non-PII terminal history on explicit scrub', async () => {
    await submit()
    await claim()
    const row = migrated.sqlite.prepare('SELECT id FROM directory_submissions').get() as { id: string }
    const response = await call(`/api/operator/submissions/${row.id}/scrub`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'The six-month private-data retention deadline was reached.' }),
    })
    expect(response.status).toBe(200)
    expect(migrated.sqlite.prepare(`SELECT state, reply_email, private_notes, disposed_at IS NOT NULL disposed
      FROM directory_submissions WHERE id = ?`).get(row.id)).toEqual({
      state: 'pii-scrubbed', reply_email: null, private_notes: null, disposed: 1,
    })
    expect(migrated.sqlite.prepare(`SELECT COUNT(*) count FROM directory_submission_events
      WHERE submission_id = ? AND action = 'personal-data-scrubbed'`).get(row.id)).toEqual({ count: 1 })
  })

  it('expires after grace without closure, removes all public projections, and forbids hard delete', async () => {
    await claim()
    migrated.sqlite.prepare(`UPDATE outpost_lifecycle SET state = 'verified', next_verification_due_at = ?,
      grace_ends_at = ? WHERE outpost_id = 'outpost-stx-70'`)
      .run('2026-08-01T00:00:00.000Z', '2026-08-31T00:00:00.000Z')

    const grace = await call('/api/operator/outposts/outpost-stx-70/lifecycle', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'grace', reason: 'Annual verification due date reached without a completed recheck.' }),
    })
    expect(grace.status).toBe(200)
    expect(migrated.sqlite.prepare("SELECT state FROM outpost_lifecycle WHERE outpost_id = 'outpost-stx-70'").get())
      .toEqual({ state: 'grace' })
    migrated.sqlite.prepare(`UPDATE outpost_lifecycle SET grace_ends_at = ? WHERE outpost_id = 'outpost-stx-70'`)
      .run('2026-07-31T00:00:00.000Z')

    const response = await call('/api/operator/outposts/outpost-stx-70/lifecycle', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'expire', reason: 'Annual verification grace period elapsed without current evidence.' }),
    })
    expect(response.status).toBe(200)
    expect(migrated.sqlite.prepare("SELECT state FROM outpost_lifecycle WHERE outpost_id = 'outpost-stx-70'").get())
      .toEqual({ state: 'verification-expired' })
    expect(migrated.sqlite.prepare("SELECT status FROM content_records WHERE id = 'outpost-stx-70'").get())
      .toEqual({ status: 'published' })
    expect(migrated.sqlite.prepare("SELECT COUNT(*) count FROM public_outpost_directory WHERE content_id = 'outpost-stx-70'").get())
      .toEqual({ count: 0 })
    expect(migrated.sqlite.prepare("SELECT COUNT(*) count FROM public_search_documents WHERE content_id = 'outpost-stx-70'").get())
      .toEqual({ count: 0 })
    const detail = await call('/api/public/records/angleton-texas-outpost-70')
    expect(detail.status).toBe(404)
    const search = await call('/api/search?q=Angleton')
    expect(JSON.stringify(await search.json())).not.toContain('outpost-stx-70')
    const bootstrap = await call('/api/public')
    expect(await bootstrap.json()).toMatchObject({ counts: { outpost: 3 } })
    expect(() => migrated.sqlite.prepare("DELETE FROM outposts WHERE content_id = 'outpost-stx-70'").run())
      .toThrow('Outpost history must be archived, not deleted')

    const privateRecord = await call('/api/operator/records/outpost-stx-70')
    const { record } = await privateRecord.json() as { record: Record<string, unknown> & { version: number } }
    const staleRestoration = await call('/api/operator/records/outpost-stx-70', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        record: { ...record, status: 'published', verifiedAt: '2026-08-13T00:00:00.000Z' },
        expectedVersion: record.version, reason: 'Reverified core listing against attached current sources.',
      }),
    })
    expect(staleRestoration.status).toBe(400)
    const sources = (record.sources as Array<Record<string, unknown>>)
      .map((source) => ({ ...source, verifiedAt: '2026-08-13T00:00:00.000Z' }))
    const restored = await call('/api/operator/records/outpost-stx-70', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        record: { ...record, sources, status: 'published', verifiedAt: '2026-08-13T00:00:00.000Z' },
        expectedVersion: record.version, reason: 'Reverified every populated listing field against attached current sources.',
      }),
    })
    expect(restored.status).toBe(200)
    expect(migrated.sqlite.prepare("SELECT state FROM outpost_lifecycle WHERE outpost_id = 'outpost-stx-70'").get())
      .toEqual({ state: 'verified' })
    expect(migrated.sqlite.prepare("SELECT COUNT(*) count FROM listing_verification_cycles WHERE outpost_id = 'outpost-stx-70'").get())
      .toEqual({ count: 2 })
    expect(migrated.sqlite.prepare("SELECT COUNT(*) count FROM public_outpost_directory WHERE content_id = 'outpost-stx-70'").get())
      .toEqual({ count: 1 })
  })

  it('archives only with attached affirmative evidence and preserves versioned history', async () => {
    await claim()
    const source = migrated.sqlite.prepare(`SELECT document.id FROM source_documents document
      JOIN field_provenance provenance ON provenance.source_document_id = document.id
      WHERE provenance.content_id = 'outpost-stx-70' LIMIT 1`).get() as { id: string }
    const response = await call('/api/operator/outposts/outpost-stx-70/lifecycle', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'archive', reason: 'The attached official source affirmatively documents closure.',
        archiveSourceId: source.id, effectiveAt: '2026-08-01',
      }),
    })
    expect(response.status).toBe(200)
    expect(migrated.sqlite.prepare("SELECT state FROM outpost_lifecycle WHERE outpost_id = 'outpost-stx-70'").get())
      .toEqual({ state: 'archived' })
    expect(migrated.sqlite.prepare("SELECT status, version FROM content_records WHERE id = 'outpost-stx-70'").get())
      .toEqual({ status: 'archived', version: 2 })
    expect(migrated.sqlite.prepare("SELECT status FROM content_revisions WHERE content_id = 'outpost-stx-70' AND version = 2").get())
      .toEqual({ status: 'archived' })
    expect(migrated.sqlite.prepare("SELECT COUNT(*) count FROM public_outpost_directory WHERE content_id = 'outpost-stx-70'").get())
      .toEqual({ count: 0 })
  })

  it('validates a population batch before mutation and stages it idempotently as private candidates', async () => {
    await claim()
    const source = { url: 'https://example.org/rangers', label: 'First-party church page', checkedAt: '2026-08-13', factKind: 'direct' }
    const manifest = {
      schemaVersion: 1, batchKey: 'test-batch', sourceRegister: 'docs/research/test.md',
      sourceVersion: '2026-08-13', reviewedAt: '2026-08-13',
      candidates: [{
        candidateKey: 'us-test-community-springfield', operation: 'new-listing', targetHubOutpostId: null,
        publicFacts: {
          church: 'Community Church', city: 'Springfield', jurisdiction: 'Missouri',
          outpostNumber: null, campusSuffix: null, district: null, region: null, fcfTerritory: null,
          programs: [], fcfActivityStatus: 'not-verified',
        },
        fieldSources: { church: [source], city: [source], jurisdiction: [source] },
      }],
    }
    const invalid = await call('/api/operator/population/stage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ manifest: { ...manifest, candidates: [{ ...manifest.candidates[0], replyEmail: 'private@example.org' }] } }),
    })
    expect(invalid.status).toBe(400)
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM population_batches').get()).toEqual({ count: 0 })

    const stage = () => call('/api/operator/population/stage', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ manifest }),
    })
    const first = await stage()
    const replay = await stage()
    expect(first.status).toBe(201)
    expect(replay.status).toBe(200)
    expect(await replay.json()).toMatchObject({ idempotent: true, candidateCount: 1 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM population_batches').get()).toEqual({ count: 1 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM staged_outpost_candidates').get()).toEqual({ count: 1 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM content_records').get()).toEqual({ count: 146 })

    const changedBatch = await call('/api/operator/population/stage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ manifest: { ...manifest, batchKey: 'test-batch-revised', sourceVersion: '2026-08-13-revised' } }),
    })
    expect(changedBatch.status).toBe(400)
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM population_batches').get()).toEqual({ count: 1 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM staged_outpost_candidates').get()).toEqual({ count: 1 })

    const queue = await call('/api/operator/population/candidates?state=staged')
    const queueBody = await queue.json() as { items: Array<{ id: string; matches: unknown[] }> }
    expect(queueBody.items).toHaveLength(1)
    expect(queueBody.items[0].matches).toEqual([])
    const applied = await call(`/api/operator/population/candidates/${encodeURIComponent(queueBody.items[0].id)}/apply`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Reviewed every staged fact and source; create a draft for preview.' }),
    })
    const appliedBody = await applied.json() as { id: string; error?: string }
    expect({ status: applied.status, error: appliedBody.error }).toEqual({ status: 201, error: undefined })
    expect(migrated.sqlite.prepare('SELECT status FROM content_records WHERE id = ?').get(appliedBody.id))
      .toEqual({ status: 'draft' })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM field_provenance WHERE content_id = ?').get(appliedBody.id))
      .toEqual({ count: 3 })
    expect(migrated.sqlite.prepare('SELECT state, applied_outpost_id FROM staged_outpost_candidates').get())
      .toEqual({ state: 'converted-to-draft', applied_outpost_id: appliedBody.id })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM public_outpost_directory WHERE content_id = ?').get(appliedBody.id))
      .toEqual({ count: 0 })
    const repeatedApply = await call(`/api/operator/population/candidates/${encodeURIComponent(queueBody.items[0].id)}/apply`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'A replay must not create another draft.' }),
    })
    expect(repeatedApply.status).toBe(400)
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM content_records').get()).toEqual({ count: 147 })
  })

  it('stages an international batch privately and creates canonical facts only on Operator conversion', async () => {
    await claim()
    const manifest = JSON.parse(readFileSync(new URL('../data/international-outposts/cohort-za-01.json', import.meta.url), 'utf8'))
    expect(migrated.sqlite.prepare("SELECT COUNT(*) count FROM countries WHERE code = 'ZA'").get()).toEqual({ count: 0 })
    const stage = () => call('/api/operator/international-population/stage', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ manifest }),
    })
    expect((await stage()).status).toBe(201)
    const replay = await stage()
    expect(replay.status).toBe(200)
    expect(await replay.json()).toMatchObject({ idempotent: true, candidateCount: 3 })
    expect(migrated.sqlite.prepare("SELECT COUNT(*) count FROM countries WHERE code = 'ZA'").get()).toEqual({ count: 0 })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM staged_international_candidates').get()).toEqual({ count: 3 })

    const queue = await call('/api/operator/international-population/candidates?country=ZA&state=staged')
    const body = await queue.json() as { items: Array<{ id: string; church: string | null }> }
    expect(body.items).toHaveLength(3)
    const supported = body.items.find((item) => item.church)
    const applied = await call(`/api/operator/international-population/candidates/${encodeURIComponent(supported!.id)}/apply`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Reviewed every cited South African source; create a private draft.' }),
    })
    expect(applied.status).toBe(201)
    const appliedBody = await applied.json() as { id: string }
    expect(migrated.sqlite.prepare("SELECT name FROM countries WHERE code = 'ZA'").get()).toEqual({ name: 'South Africa' })
    expect(migrated.sqlite.prepare("SELECT name FROM national_programs WHERE id = 'rr-south-africa'").get()).toEqual({ name: 'Royal Rangers South Africa' })
    expect(migrated.sqlite.prepare('SELECT status FROM content_records WHERE id = ?').get(appliedBody.id)).toEqual({ status: 'draft' })
    expect(migrated.sqlite.prepare('SELECT COUNT(*) count FROM public_outpost_directory WHERE content_id = ?').get(appliedBody.id)).toEqual({ count: 0 })
  })

  it('derives complete jurisdiction and region coverage only from eligible public listings', async () => {
    const response = await call('/api/public')
    const body = await response.json() as {
      coverage: {
        jurisdictions: Array<{ name: string; verifiedListingCount: number }>
        regions: Array<{ name: string; verifiedListingCount: number }>
      }
    }
    expect(body.coverage.jurisdictions).toHaveLength(56)
    expect(body.coverage.jurisdictions.find((item) => item.name === 'Texas')?.verifiedListingCount).toBe(4)
    expect(body.coverage.jurisdictions.find((item) => item.name === 'California')?.verifiedListingCount).toBe(0)
    expect(body.coverage.regions).toHaveLength(8)
    expect(body.coverage.regions.find((item) => item.name === 'South Central Region')?.verifiedListingCount).toBe(4)
    expect(JSON.stringify(body)).not.toMatch(/replyEmail|privateNotes|referenceCode|operatorTenure/i)
  })

  it('rejects proposal and population work when Operator privilege renewal is required', async () => {
    await claim()
    migrated.sqlite.prepare(`UPDATE operator_account SET renewal_due_at = ?, version = version + 1
      WHERE singleton_key = 1`).run('2026-08-12T00:00:00.000Z')
    expect((await call('/api/operator/submissions')).status).toBe(423)
    expect((await call('/api/operator/population/candidates')).status).toBe(423)
    expect((await call('/api/operator/population/stage', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ manifest: {} }),
    })).status).toBe(423)
  })
})
