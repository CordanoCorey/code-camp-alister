import { describe, expect, it } from 'vitest'
import type { ContentRecord, RecordDetails, RecordKind } from '../shared/domain'
import { saveNormalizedRecord, type EditableRecord } from './content-writes'
import type { OperatorPrincipal } from './operator-lifecycle-repository'

function database() {
  const prepared: Array<{ sql: string; bindings: unknown[] }> = []
  let batch: Array<{ sql: string; bindings: unknown[] }> = []
  const db = {
    prepare(sql: string) {
      const statement = {
        sql,
        bindings: [] as unknown[],
        bind(...bindings: unknown[]) { this.bindings = bindings; return this },
      }
      prepared.push(statement)
      return statement
    },
    async batch(statements: Array<{ sql: string; bindings: unknown[] }>) { batch = statements; return [] },
  }
  return { db: db as unknown as D1Database, prepared, get batch() { return batch } }
}

const details: Record<RecordKind, RecordDetails> = {
  outpost: {
    hubOutpostId: 'outpost-1', outpostNumber: '7', campusSuffix: null, church: 'Test Church',
    streetAddress: null, city: 'Austin', jurisdiction: 'Texas', postalCode: null,
    district: 'North Texas District', region: 'South Central Region', languageOverlay: '',
    fcfTerritory: 'Frontier Territory', activeFcf: null, programs: ['Ranger Kids'],
    meeting: null, contactUrl: null,
  },
  event: {
    occurrenceId: 'event-1', series: { id: 'series-1', name: 'Series' }, category: 'camp', host: 'Host',
    scope: 'district', relatedOrganizations: [], startDate: '2027-01-01', endDate: null,
    startTime: null, endTime: null, timeZone: 'America/Chicago', allDay: true,
    locationStatus: 'not-verified', location: null, audience: ['Leaders'],
    registrationStatus: 'not-verified', registrationUrl: null, registrationDeadline: null,
    deadlineExceptionNote: null, costStatus: 'not-verified', costNote: null,
    lifecycleStatus: 'scheduled', officialUrl: 'https://example.org/event',
  },
  advancement: {
    subtype: 'merit', programGroups: ['Adventure Rangers'], audiences: [], gradeRange: null,
    officialUrl: 'https://example.org/merit', contentStatus: 'current', references: [],
    meritCategory: 'skill', colors: ['blue'],
  },
  organization: {
    organizationType: 'district', scope: 'geographic', parent: 'South Central Region',
    affiliations: [], jurisdictions: ['Texas'],
  },
  page: {
    section: 'help', body: ['Safe public help.'], links: [{ label: 'Official', url: 'https://example.org' }],
  },
}

function input(kind: RecordKind): EditableRecord {
  return {
    kind, slug: `test-${kind}`, title: `Test ${kind}`, summary: 'Test summary', status: 'published',
    details: details[kind], verifiedAt: '2026-08-12T00:00:00.000Z',
    sources: [{ id: `source-${kind}`, fieldName: 'title', label: 'Official source', url: `https://example.org/${kind}`, verifiedAt: '2026-08-12T00:00:00.000Z' }],
  }
}

describe('normalized atomic content writes', () => {
  const operator: OperatorPrincipal = { tenureNumber: 3, label: 'Operator tenure 3' }

  it.each([
    ['outpost', 'INSERT INTO outposts'],
    ['event', 'INSERT INTO event_occurrences'],
    ['advancement', 'INSERT INTO advancement_items'],
    ['organization', 'INSERT INTO organization_units'],
    ['page', 'INSERT INTO information_pages'],
  ] as const)('writes %s facts, provenance, search, revision, and audit in one batch', async (kind, typedInsert) => {
    const state = database()
    await saveNormalizedRecord(state.db, `test-${kind}`, input(kind), operator, 'Test write', null, null)
    const sql = state.batch.map((statement) => statement.sql).join('\n')

    expect(sql).toContain(typedInsert)
    expect(sql).toContain('INSERT INTO field_provenance')
    expect(sql).toContain('INSERT INTO public_search_documents')
    expect(sql).toContain('INSERT INTO content_revisions')
    expect(sql).toContain('INSERT INTO content_audit_events')
    expect(sql).toContain('operator_tenure_id')
    expect(state.batch.flatMap((statement) => statement.bindings)).toContain('Operator tenure 3')
    expect(state.batch.flatMap((statement) => statement.bindings)).toContain(3)
    expect(sql).not.toContain('UPDATE record_sources')
    expect(sql).not.toContain('UPDATE event_conflicts')
    expect(sql).not.toContain('details_json =')
  })

  it('puts the SQL stale-write abort immediately after the guarded envelope update', async () => {
    const state = database()
    const editable = input('page')
    const previous: ContentRecord = {
      ...editable, id: 'test-page', publishedAt: '2026-08-12T00:00:00.000Z',
      updatedAt: '2026-08-12T00:00:00.000Z', version: 4,
    }
    await saveNormalizedRecord(state.db, previous.id, editable, operator, 'Update', previous, 4)

    expect(state.batch[0].sql).toContain('WHERE id = ? AND version = ?')
    expect(state.batch[1].sql).toContain('INSERT INTO content_write_checks')
    expect(state.batch[1].bindings).toEqual(['test-page', 4])
  })

  it('rejects a browser version that is already stale before constructing a batch', async () => {
    const state = database()
    const editable = input('page')
    const previous: ContentRecord = {
      ...editable, id: 'test-page', publishedAt: null, updatedAt: '2026-08-12T00:00:00.000Z', version: 5,
    }
    await expect(saveNormalizedRecord(state.db, previous.id, editable, operator, 'Stale', previous, 4))
      .rejects.toThrow('Reload it before saving')
    expect(state.batch).toEqual([])
  })
})
