import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './index'

type Seed = {
  records?: Record<string, unknown>[]
  sources?: Record<string, unknown>[]
  conflicts?: Record<string, unknown>[]
  audit?: Record<string, unknown>[]
  brokenSources?: Record<string, unknown>[]
  coverageGaps?: Record<string, unknown>[]
  latestMigration?: string
  readinessFailure?: Error
  operatorAccount?: Record<string, unknown> | null
  firstRows?: Array<{ sqlIncludes: string; row: Record<string, unknown> | null }>
}

function createDb(seed: Seed = {}) {
  const queries: Array<{ sql: string; bindings: unknown[] }> = []
  const batches: Array<Array<{ sql: string; bindings: unknown[] }>> = []
  let mutations = 0

  const db = {
    prepare(sql: string) {
      const statement = {
        sql,
        bindings: [] as unknown[],
        bind(...bindings: unknown[]) {
          this.bindings = bindings
          return this
        },
        async all<T>() {
          queries.push({ sql, bindings: this.bindings })
          let results: Record<string, unknown>[] = []
          const records = seed.records ?? []
          const published = records.filter((record) => record.status === 'published')
          const details = (record: Record<string, unknown>) => JSON.parse(String(record.details_json ?? '{}')) as Record<string, unknown>
          if (sql.includes('FROM public_search_fts JOIN public_search_documents')) {
            results = published.map((record) => ({ id: record.id, title_sort: String(record.title).toLowerCase(), cursor_id: record.id }))
          } else if (sql.includes('SELECT id FROM (') || sql.includes("(kind = 'page' OR")) {
            results = published.map((record) => ({ id: record.id }))
          } else if (sql.includes('COUNT(*) count FROM content_records')) {
            results = [...new Set(published.map((record) => record.kind))].map((kind) => ({ kind, count: published.filter((record) => record.kind === kind).length }))
          } else if (sql.includes('FROM event_occurrences e')) {
            results = records.filter((record) => record.kind === 'event').map((record) => {
              const value = details(record)
              return {
                id: record.id, content_id: record.id, occurrence_id: value.occurrenceId,
                series_id: null, series_name: null, category: value.category, host: value.host, scope: value.scope,
                start_date: value.startDate, end_date: value.endDate, start_time: value.startTime,
                end_time: value.endTime, time_zone: value.timeZone, all_day: value.allDay ? 1 : 0,
                location_status: value.locationStatus, location: value.location,
                registration_status: value.registrationStatus, registration_url: value.registrationUrl,
                registration_deadline: value.registrationDeadline, deadline_exception_note: value.deadlineExceptionNote,
                cost_status: value.costStatus, cost_note: value.costNote, lifecycle_status: value.lifecycleStatus,
                official_url: value.officialUrl, organizations_json: JSON.stringify(value.relatedOrganizations ?? []),
                audiences_json: JSON.stringify(value.audience ?? []),
              }
            })
          } else if (sql.includes('FROM information_pages p')) {
            results = records.filter((record) => record.kind === 'page').map((record) => ({ id: record.id, section: details(record).section, body_json: JSON.stringify(details(record).body ?? []), links_json: JSON.stringify(details(record).links ?? []) }))
          } else if (sql.includes('FROM field_provenance p JOIN source_documents')) {
            results = (seed.sources ?? []).map((source) => ({
              id: source.id, content_id: source.record_id, field_path: source.field_name,
              source_label: source.label, url: source.url, verified_at: source.verified_at,
            }))
          } else if (sql.includes('FROM normalized_event_conflicts conflict')) {
            results = seed.conflicts ?? []
          } else if (sql.includes('FROM content_records')) results = records.map((record) => ({ ...record, version: 1 }))
          else if (sql.includes('FROM record_sources')) results = seed.sources ?? []
          else if (sql.includes('FROM event_conflicts')) results = seed.conflicts ?? []
          else if (sql.includes('FROM audit_events')) results = seed.audit ?? []
          else if (sql.includes('FROM broken_source_observations')) results = seed.brokenSources ?? []
          else if (sql.includes('FROM coverage_gaps')) results = seed.coverageGaps ?? []
          return { results } as { results: T[] }
        },
        async first<T>() {
          queries.push({ sql, bindings: this.bindings })
          const seeded = seed.firstRows?.find((candidate) => sql.includes(candidate.sqlIncludes))
          if (seeded) return seeded.row as T | null
          if (sql.includes('FROM d1_migrations')) {
            if (seed.readinessFailure) throw seed.readinessFailure
            return (seed.latestMigration ? { name: seed.latestMigration } : null) as T | null
          }
          if (sql.includes('FROM operator_account')) {
            const account = seed.operatorAccount === undefined ? {
              state: 'active', display_name: 'Local preview', verified_email: 'local-preview@operator.invalid',
              current_outpost_id: null, current_outpost_title: null, active_tenure_number: 1,
              activated_at: '2026-08-13T00:00:00.000Z', renewal_due_at: '2099-08-13T00:00:00.000Z',
              access_cleanup_required: 0, access_cleanup_confirmed_at: null, version: 1,
            } : seed.operatorAccount
            if (sql.includes('verified_email = ?') && account?.verified_email !== this.bindings[0]) return null as T | null
            return account as T | null
          }
          return null as T | null
        },
        async run() {
          queries.push({ sql, bindings: this.bindings })
          mutations += 1
          return {} as D1Result
        },
      }
      return statement
    },
    async batch(statements: Array<{ sql: string; bindings: unknown[] }>) {
      batches.push(statements.map((statement) => ({ sql: statement.sql, bindings: [...statement.bindings] })))
      mutations += statements.length
      return []
    },
  }

  return {
    db: db as unknown as D1Database,
    queries,
    batches,
    get mutations() { return mutations },
  }
}

function createEnv(db: D1Database, overrides: Record<string, string | undefined> = {}) {
  return {
    ASSETS: { fetch: async () => new Response('asset') },
    DB: db,
    ...overrides,
  } as never
}

async function request(url: string, init: RequestInit, env: never) {
  return worker.fetch(new Request(url, init), env)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Operator authorization at the Worker request seam', () => {
  it('rejects the snapshot without identity before touching D1', async () => {
    const database = createDb()
    const response = await request('https://hub.example/api/operator/snapshot', {}, createEnv(database.db))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Operator authorization required.' })
    expect(database.queries).toEqual([])
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('never treats an ordinary Account session cookie as Operator authority', async () => {
    const database = createDb()
    const response = await request('https://hub.example/api/operator/snapshot', {
      headers: { cookie: 'better-auth.session_token=ordinary-account-session' },
    }, createEnv(database.db))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Operator authorization required.' })
    expect(database.queries).toEqual([])
    expect(database.mutations).toBe(0)
  })

  it.each([
    ['create record', '/api/operator/records', 'POST'],
    ['update record', '/api/operator/records/record-1', 'PUT'],
    ['reverify source', '/api/operator/sources/source-1/reverify', 'POST'],
    ['record broken source', '/api/operator/sources/source-1/broken', 'POST'],
    ['change event lifecycle', '/api/operator/events/event-1/lifecycle', 'POST'],
    ['open event conflict', '/api/operator/conflicts', 'POST'],
    ['resolve event conflict', '/api/operator/conflicts/conflict-1', 'PUT'],
    ['record coverage gap', '/api/operator/coverage-gaps', 'POST'],
    ['resolve coverage gap', '/api/operator/coverage-gaps/gap-1', 'PUT'],
  ])('rejects unauthorized %s before touching D1', async (_label, path, method) => {
    const database = createDb()
    const response = await request(`https://hub.example${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ private: 'payload' }),
    }, createEnv(database.db))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Operator authorization required.' })
    expect(database.queries).toEqual([])
    expect(database.mutations).toBe(0)
  })

  it('fails closed for missing configuration and malformed assertions without sensitive details', async () => {
    const database = createDb()
    const missingConfig = await request('https://hub.example/api/operator/snapshot', {
      headers: { 'Cf-Access-Jwt-Assertion': 'not-a-jwt' },
    }, createEnv(database.db))
    const malformed = await request('https://hub.example/api/operator/snapshot', {
      headers: { 'Cf-Access-Jwt-Assertion': 'not-a-jwt' },
    }, createEnv(database.db, {
      ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com',
      ACCESS_POLICY_AUD: 'expected-audience',
    }))

    expect(await missingConfig.json()).toEqual({ error: 'Operator authorization required.' })
    expect(await malformed.json()).toEqual({ error: 'Operator authorization required.' })
    expect(database.queries).toEqual([])
  })

  it('fails closed for wrong issuer, wrong audience, and invalid signatures', async () => {
    const issuer = 'https://team.cloudflareaccess.com'
    const audience = 'expected-audience'
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const { privateKey: otherPrivateKey } = await generateKeyPair('RS256')
    const publicJwk = await exportJWK(publicKey)
    const sign = (tokenIssuer: string, tokenAudience: string, key = privateKey) => new SignJWT({ email: 'operator@example.org' })
      .setProtectedHeader({ alg: 'RS256', kid: 'operator-key' })
      .setIssuer(tokenIssuer)
      .setAudience(tokenAudience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key)
    const now = Math.floor(Date.now() / 1000)
    const expired = new SignJWT({ email: 'operator@example.org' })
      .setProtectedHeader({ alg: 'RS256', kid: 'operator-key' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt(now - 120)
      .setExpirationTime(now - 60)
      .sign(privateKey)
    const notYetValid = new SignJWT({ email: 'operator@example.org' })
      .setProtectedHeader({ alg: 'RS256', kid: 'operator-key' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt(now)
      .setNotBefore(now + 60)
      .setExpirationTime(now + 300)
      .sign(privateKey)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ keys: [{ ...publicJwk, kid: 'operator-key', alg: 'RS256', use: 'sig' }] })))

    for (const token of [
      await sign('https://wrong.cloudflareaccess.com', audience),
      await sign(issuer, 'wrong-audience'),
      await sign(issuer, audience, otherPrivateKey),
      await expired,
      await notYetValid,
    ]) {
      const database = createDb()
      const response = await request('https://hub.example/api/operator/snapshot', {
        headers: { 'Cf-Access-Jwt-Assertion': token },
      }, createEnv(database.db, { ACCESS_TEAM_DOMAIN: issuer, ACCESS_POLICY_AUD: audience }))
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'Operator authorization required.' })
      expect(database.queries).toEqual([])
    }
  })

  it('allows the explicit local bypass only on exact loopback hostnames', async () => {
    for (const hostname of ['localhost', '127.0.0.1']) {
      const database = createDb()
      const response = await request(`http://${hostname}/api/operator/snapshot`, {}, createEnv(database.db, { LOCAL_OPERATOR_PREVIEW: 'true' }))
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }

    for (const url of [
      'http://localhost.example/api/operator/snapshot',
      'http://127.0.0.1.example/api/operator/snapshot',
      'https://hub.example/api/operator/snapshot',
    ]) {
      const database = createDb()
      const response = await request(url, {}, createEnv(database.db, { LOCAL_OPERATOR_PREVIEW: 'true' }))
      expect(response.status).toBe(401)
      expect(database.queries).toEqual([])
    }

    const database = createDb()
    const disabled = await request('http://localhost/api/operator/snapshot', {}, createEnv(database.db, { LOCAL_OPERATOR_PREVIEW: 'false' }))
    expect(disabled.status).toBe(401)
  })

  it('rejects malformed and oversized authorized bodies with plain-language errors', async () => {
    const malformedDatabase = createDb()
    const malformed = await request('http://localhost/api/operator/records', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    }, createEnv(malformedDatabase.db, { LOCAL_OPERATOR_PREVIEW: 'true' }))
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toEqual({ error: 'Request body must be valid JSON.' })
    expect(malformedDatabase.mutations).toBe(0)

    const oversizedDatabase = createDb()
    const oversized = await request('http://localhost/api/operator/records', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'x'.repeat(70_000) }),
    }, createEnv(oversizedDatabase.db, { LOCAL_OPERATOR_PREVIEW: 'true' }))
    expect(oversized.status).toBe(413)
    expect(await oversized.json()).toEqual({ error: 'Request body is too large.' })
    expect(oversizedDatabase.mutations).toBe(0)
  })

  it('bounds common record text before a write', async () => {
    const database = createDb()
    const response = await request('http://localhost/api/operator/records', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        record: {
          kind: 'page', slug: 'bounded-page', title: 'x'.repeat(201), summary: 'Summary', status: 'draft',
          details: { section: 'help', body: [], links: [] }, verifiedAt: null,
          sources: [{ id: '', fieldName: 'record', label: 'Source', url: 'https://example.org', verifiedAt: '2026-08-12' }],
        },
      }),
    }, createEnv(database.db, { LOCAL_OPERATOR_PREVIEW: 'true' }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Title must be 200 characters or fewer.' })
    expect(database.mutations).toBe(0)
  })

  it('returns a plain 409 when an Operator edit carries a stale version', async () => {
    const record = {
      id: 'page-1', kind: 'page', slug: 'page-1', title: 'Help', summary: 'Help summary', status: 'draft',
      details_json: JSON.stringify({ section: 'help', body: ['Help'], links: [] }),
      verified_at: null, published_at: null, updated_at: '2026-08-12T00:00:00.000Z',
    }
    const source = {
      id: 'source-page', record_id: 'page-1', field_name: 'title', label: 'Official',
      url: 'https://example.org/page', verified_at: '2026-08-12T00:00:00.000Z',
    }
    const database = createDb({ records: [record], sources: [source] })
    const response = await request('http://localhost/api/operator/records/page-1', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expectedVersion: 0,
        record: {
          kind: 'page', slug: 'page-1', title: 'Help', summary: 'Help summary', status: 'draft',
          details: { section: 'help', body: ['Help'], links: [] }, verifiedAt: null,
          sources: [{ id: source.id, fieldName: 'title', label: source.label, url: source.url, verifiedAt: source.verified_at }],
        },
      }),
    }, createEnv(database.db, { LOCAL_OPERATOR_PREVIEW: 'true' }))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'This record changed after you opened it. Reload it before saving.' })
    expect(database.mutations).toBe(0)
  })

  it('attributes every non-record editorial mutation to the active tenure instead of an email', async () => {
    const eventDetails = {
      occurrenceId: 'event-occurrence', series: null, category: 'camp', host: 'Host', scope: 'district',
      relatedOrganizations: [], startDate: '2027-06-01', endDate: null, startTime: null, endTime: null,
      timeZone: 'America/New_York', allDay: true, locationStatus: 'not-announced', location: null,
      audience: [], registrationStatus: 'not-verified', registrationUrl: null, registrationDeadline: null,
      deadlineExceptionNote: null, costStatus: 'not-verified', costNote: null, lifecycleStatus: 'scheduled',
      officialUrl: 'https://example.org/event',
    }
    const eventRecord = {
      id: 'event-1', kind: 'event', slug: 'event-1', title: 'Event', summary: 'Summary', status: 'published',
      details_json: JSON.stringify(eventDetails), verified_at: '2026-08-12T00:00:00.000Z',
      published_at: '2026-08-12T00:00:00.000Z', updated_at: '2026-08-12T00:00:00.000Z',
    }
    const sourceRow = {
      id: 'source-1', record_id: 'event-1', field_name: 'title', label: 'Official',
      url: 'https://example.org/event', verified_at: '2026-08-12T00:00:00.000Z',
    }
    const cases: Array<{ path: string; method: string; body?: unknown; seed: Seed }> = [
      { path: '/api/operator/sources/source-1/reverify', method: 'POST', seed: {
        firstRows: [{ sqlIncludes: 'FROM field_provenance provenance', row: sourceRow }],
      } },
      { path: '/api/operator/sources/source-1/broken', method: 'POST', body: { broken: true, note: 'Unavailable' }, seed: {
        firstRows: [{ sqlIncludes: 'FROM field_provenance provenance', row: sourceRow }],
      } },
      { path: '/api/operator/sources/source-1/broken', method: 'POST', body: { broken: false, note: 'Working again' }, seed: {
        firstRows: [
          { sqlIncludes: 'FROM field_provenance provenance', row: sourceRow },
          { sqlIncludes: 'FROM source_health_observations', row: {
            id: 'observation-1', source_id: 'source-1', record_id: 'event-1',
            observed_at: '2026-08-12T00:00:00.000Z', observed_by: 'Operator tenure 1',
            note: 'Unavailable', cleared_at: null, cleared_by: null,
          } },
        ],
      } },
      { path: '/api/operator/events/event-1/lifecycle', method: 'POST',
        body: { status: 'confirmed', reason: 'Organizer confirmed' }, seed: { records: [eventRecord] } },
      { path: '/api/operator/conflicts', method: 'POST', body: {
        eventId: 'event-1', fieldName: 'location', reason: 'Sources disagree',
        assertions: [
          { sourceId: 'source-1', sourceLabel: 'One', assertedValue: 'A' },
          { sourceId: 'source-2', sourceLabel: 'Two', assertedValue: 'B' },
        ],
      }, seed: { firstRows: [{ sqlIncludes: "kind = 'event'", row: { id: 'event-1' } }] } },
      { path: '/api/operator/conflicts/conflict-1', method: 'PUT', body: { resolutionNote: 'Resolved' }, seed: {
        firstRows: [{ sqlIncludes: 'FROM normalized_event_conflicts conflict WHERE conflict.id', row: {
          id: 'conflict-1', event_id: 'event-1', field_name: 'location', status: 'open',
          opened_at: '2026-08-12T00:00:00.000Z', opened_by: 'Legacy operator',
          resolution_note: null, resolved_at: null, resolved_by: null, assertions_json: '[]',
        } }],
      } },
      { path: '/api/operator/coverage-gaps', method: 'POST',
        body: { scope: 'Region', description: 'No current source', sourceUrl: null }, seed: {} },
      { path: '/api/operator/coverage-gaps/gap-1', method: 'PUT',
        body: { status: 'resolved', reason: 'Source found' }, seed: {
          firstRows: [{ sqlIncludes: 'FROM normalized_coverage_gaps gap', row: {
            id: 'gap-1', scope: 'Region', description: 'No current source', source_url: null,
            last_checked_at: '2026-08-12T00:00:00.000Z', status: 'open', resolution_reason: null,
            created_at: '2026-08-12T00:00:00.000Z', created_by: 'Legacy operator',
            resolved_at: null, resolved_by: null,
          } }],
        } },
    ]

    for (const scenario of cases) {
      const database = createDb(scenario.seed)
      const response = await request(`http://localhost${scenario.path}`, {
        method: scenario.method,
        headers: scenario.body === undefined ? undefined : { 'content-type': 'application/json' },
        body: scenario.body === undefined ? undefined : JSON.stringify(scenario.body),
      }, createEnv(database.db, { LOCAL_OPERATOR_PREVIEW: 'true' }))
      expect(response.status, scenario.path).toBeLessThan(300)
      const statements = database.batches.flat()
      expect(statements.length, scenario.path).toBeGreaterThan(0)
      expect(statements.map((statement) => statement.sql).join('\n'), scenario.path).toMatch(/operator_tenure_id/)
      const bindings = statements.flatMap((statement) => statement.bindings)
      expect(bindings, scenario.path).toContain('Operator tenure 1')
      expect(bindings, scenario.path).toContain(1)
      expect(JSON.stringify(bindings), scenario.path).not.toContain('local-preview@operator.invalid')
    }
  })
})

describe('public API privacy contract at the Worker request seam', () => {
  const eventDetails = {
    occurrenceId: 'event-occurrence', series: null, category: 'camp', host: 'Public host', scope: 'district',
    relatedOrganizations: [], startDate: '2027-06-01', endDate: null, startTime: null, endTime: null,
    timeZone: 'America/New_York', allDay: true, locationStatus: 'announced', location: 'Private until conflict resolves',
    audience: ['Leaders'], registrationStatus: 'not-verified', registrationUrl: null, registrationDeadline: null,
    deadlineExceptionNote: null, costStatus: 'not-verified', costNote: null, lifecycleStatus: 'scheduled',
    officialUrl: 'https://example.org/event', privateNotes: 'never public', submitterEmail: 'person@example.org',
  }
  const row = (id: string, kind: string, status: string, details: unknown) => ({
    id, kind, slug: id, title: `${status} ${kind}`, summary: 'Public summary', status,
    details_json: JSON.stringify(details), verified_at: '2026-08-12T00:00:00.000Z',
    published_at: '2026-08-12T00:00:00.000Z', updated_at: '2026-08-12T00:00:00.000Z',
  })
  const seed = {
    records: [
      row('published-event', 'event', 'published', eventDetails),
      row('draft-page', 'page', 'draft', { section: 'help', body: ['Draft'], links: [], auditActor: 'operator@example.org' }),
      row('archived-page', 'page', 'archived', { section: 'help', body: ['Archived'], links: [], brokenSourceNote: 'private' }),
    ],
    sources: [{
      id: 'source-location', record_id: 'published-event', field_name: 'location', label: 'Organizer',
      url: 'https://example.org/event', verified_at: '2026-08-12T00:00:00.000Z', observed_by: 'operator@example.org', note: 'private source note',
    }],
    conflicts: [{
      id: 'conflict-1', event_id: 'published-event', field_name: 'location',
      assertions_json: JSON.stringify([{ sourceId: 'source-location', sourceLabel: 'Private source', assertedValue: 'Private place' }]),
      status: 'open', opened_at: '2026-08-12T00:00:00.000Z', opened_by: 'operator@example.org',
      resolution_note: 'private resolution', resolved_at: null, resolved_by: null,
    }],
    audit: [{ id: 1, actor: 'private-audit-actor@example.org', reason: 'private audit reason' }],
    brokenSources: [{ id: 'broken-1', note: 'private broken-source observation' }],
    coverageGaps: [{ id: 'gap-1', description: 'private coverage-gap note' }],
  }

  it.each(['/api/public', '/api/search?q=camp'])('%s returns only published, conflict-safe, allowlisted data', async (path) => {
    const database = createDb(seed)
    const response = await request(`https://hub.example${path}`, {}, createEnv(database.db))
    const body = await response.json() as { records?: Array<Record<string, unknown>>; featuredRecords?: Array<Record<string, unknown>> }
    const publicRecords = body.records ?? body.featuredRecords ?? []
    const serialized = JSON.stringify(body)

    expect(response.status).toBe(200)
    expect(publicRecords).toHaveLength(1)
    expect(publicRecords[0].id).toBe('published-event')
    expect((publicRecords[0].details as Record<string, unknown>).location).toBeNull()
    expect(serialized).not.toMatch(/draft-page|archived-page|person@example|operator@example|private source|private place|private resolution|private note|private audit|private broken|private coverage|auditActor|submitter|brokenSource/i)
    expect(database.queries.map((query) => query.sql).join('\n')).not.toMatch(/audit_events|broken_source_observations|coverage_gaps/i)
    expect(response.headers.get('cache-control')).toMatch(/^public,/)
  })

  it('does not mutate for unsupported public writes or unknown routes', async () => {
    const database = createDb(seed)
    const publicWrite = await request('https://hub.example/api/public', { method: 'POST', body: '{}' }, createEnv(database.db))
    const unknown = await request('https://hub.example/api/unknown', { method: 'PUT', body: '{}' }, createEnv(database.db))

    expect(publicWrite.status).toBe(404)
    expect(unknown.status).toBe(404)
    expect(database.queries).toEqual([])
    expect(database.mutations).toBe(0)
  })

  it('escapes full-text search operators before binding the query', async () => {
    const database = createDb(seed)
    await request('https://hub.example/api/search?q=%22camp%22%20OR%20*', {}, createEnv(database.db))
    const search = database.queries.find((query) => query.sql.includes('FROM public_search_fts JOIN public_search_documents'))

    expect(search?.bindings[0]).toBe('"camp"* "OR"*')
  })

  it('adds high-value response security headers and HSTS only for deployed HTTPS', async () => {
    const deployed = await request('https://hub.example/api/public', {}, createEnv(createDb(seed).db))
    const local = await request('http://localhost/api/public', {}, createEnv(createDb(seed).db))

    expect(deployed.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(deployed.headers.get('content-security-policy')).toContain("object-src 'none'")
    expect(deployed.headers.get('content-security-policy')).toContain("base-uri 'self'")
    expect(deployed.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains')
    expect(local.headers.has('strict-transport-security')).toBe(false)
  })
})

describe('production readiness at the Worker request seam', () => {
  it.each(['GET', 'HEAD'])('%s proves the current schema is available without leaking configuration', async (method) => {
    const database = createDb({ latestMigration: '0013_international_directory_foundation.sql' })
    const response = await request('https://hub.example/api/health', { method }, createEnv(database.db))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(database.queries).toHaveLength(1)
    expect(database.queries[0].sql).toContain('FROM d1_migrations')
    expect(database.queries[0].bindings).toEqual(['0016_reference_event_outpost_plans.sql'])
    if (method === 'HEAD') expect(await response.text()).toBe('')
    else expect(await response.json()).toEqual({ status: 'ok', schema: '0015' })
  })

  it.each([
    ['the current migration is missing', {}],
    ['D1 cannot execute the readiness query', { readinessFailure: new Error('private database detail') }],
  ])('fails closed when %s', async (_label, seed) => {
    const response = await request(
      'https://hub.example/api/health',
      {},
      createEnv(createDb(seed).db),
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ status: 'unavailable' })
  })
})

describe('production request observability at the Worker request seam', () => {
  it('emits a correlation ID and bounded metadata without logging the URL, query, or identity', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const response = await request(
      'https://hub.example/api/search?q=operator%40example.org',
      {},
      createEnv(createDb().db),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(log).toHaveBeenCalledTimes(1)
    const entry = JSON.parse(String(log.mock.calls[0][0])) as Record<string, unknown>
    expect(entry).toMatchObject({
      event: 'request',
      routeCategory: 'public-api',
      status: 200,
      requestId: response.headers.get('x-request-id'),
    })
    expect(entry.durationMs).toEqual(expect.any(Number))
    expect(JSON.stringify(entry)).not.toMatch(/operator|example\.org|search|q=|https:/i)
  })
})
