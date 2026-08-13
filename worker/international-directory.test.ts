import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMigratedD1 } from './test-sqlite-d1'
import { listPublicOutposts } from './content-repository'
import { listOrdinaryOutpostMatches } from './account-profile-repository'
import { claimOperatorAccount } from './operator-lifecycle-repository'

describe('international directory foundation', () => {
  let migrated: ReturnType<typeof createMigratedD1>
  beforeEach(async () => {
    migrated = createMigratedD1()
    await claimOperatorAccount(migrated.db, { displayName: 'Test Operator', email: 'operator@example.org', currentOutpostId: null, confirmedAt: '2026-08-13T00:00:00.000Z', renewalDueAt: '2030-08-13T00:00:00.000Z', attestationVersion: 'operator-adult-v1', requestId: crypto.randomUUID() })
  })
  afterEach(() => migrated.close())

  function seedPublishedInternational(input: { id: string; country: string; program: string; number: string; church: string; city: string; subdivision?: string; fcf?: 'yes' | 'no' | 'not-verified' }) {
    const geography = input.subdivision ?? input.country
    migrated.sqlite.prepare(`INSERT OR IGNORE INTO civil_geographies
      (id, geography_type, name, code, country_code, parent_id, display_order, display_label)
      VALUES (?, 'municipality', ?, NULL, ?, 'country-' || lower(?), 100, ?)`)
      .run(`test-${input.country.toLowerCase()}-${input.id}`, geography, input.country, input.country, input.subdivision ? 'Province' : null)
    migrated.sqlite.prepare(`INSERT INTO content_records
      (id, kind, slug, title, summary, status, details_json, verified_at, published_at, updated_at, version)
      VALUES (?, 'outpost', ?, ?, 'Verified test listing', 'published', '{}', ?, ?, ?, 1)`)
      .run(input.id, input.id, `${input.number} · ${input.church}`, '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z')
    migrated.sqlite.prepare(`INSERT INTO outposts
      (content_id, hub_outpost_id, national_program_id, external_number, church, city, civil_geography_id,
       fcf_activity_status, local_unit_label, identifier_raw)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Outpost', ?)`)
      .run(input.id, input.id, input.program, input.number, input.church, input.city, `test-${input.country.toLowerCase()}-${input.id}`, input.fcf ?? 'not-verified', input.number)
    migrated.sqlite.prepare(`INSERT INTO source_documents(id, url, label, created_at) VALUES (?, ?, 'Official source', ?)`)
      .run(`source-${input.id}`, `https://example.org/${input.id}`, '2026-08-13T00:00:00.000Z')
    migrated.sqlite.prepare(`INSERT INTO field_provenance(id, content_id, field_path, source_document_id, source_label, verified_at)
      VALUES (?, ?, 'church', ?, 'Official source', ?)`)
      .run(`prov-${input.id}`, input.id, `source-${input.id}`, '2026-08-13T00:00:00.000Z')
    migrated.sqlite.prepare(`INSERT INTO outpost_lifecycle(outpost_id, state, last_verified_at, next_verification_due_at, grace_ends_at, version, updated_at)
      VALUES (?, 'verified', ?, '2027-08-13T00:00:00.000Z', '2027-09-12T00:00:00.000Z', 1, ?)`)
      .run(input.id, '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z')
    migrated.sqlite.prepare(`INSERT INTO listing_verification_cycles
      (id, outpost_id, cycle_number, verified_at, next_due_at, grace_ends_at, outcome, reason, operator_tenure_id, created_at)
      VALUES (?, ?, 1, ?, '2027-08-13T00:00:00.000Z', '2027-09-12T00:00:00.000Z', 'verified', 'Test', 1, ?)`)
      .run(`cycle-${input.id}`, input.id, '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z')
    migrated.sqlite.prepare(`INSERT INTO listing_verification_provenance
      (verification_cycle_id, provenance_id, source_document_id, field_path, source_label, source_url, verified_at)
      VALUES (?, ?, ?, 'church', 'Official source', ?, ?)`)
      .run(`cycle-${input.id}`, `prov-${input.id}`, `source-${input.id}`, `https://example.org/${input.id}`, '2026-08-13T00:00:00.000Z')
    migrated.sqlite.prepare(`INSERT INTO public_outpost_directory
      (content_id, title_sort, church_sort, national_program_id, external_number, campus_suffix, city, civil_geography_id, fcf_activity_status, verified_at)
      VALUES (?, lower(?), lower(?), ?, ?, NULL, ?, ?, ?, ?)`)
      .run(input.id, `${input.number} · ${input.church}`, input.church, input.program, input.number, input.city, `test-${input.country.toLowerCase()}-${input.id}`, input.fcf ?? 'not-verified', '2026-08-13T00:00:00.000Z')
    migrated.sqlite.prepare(`INSERT INTO public_search_documents(content_id, kind, title, summary, safe_text)
      VALUES (?, 'outpost', ?, 'Verified test listing', ?)`)
      .run(input.id, `${input.number} · ${input.church}`, `${input.church} ${input.city} ${input.number}`)
  }

  it('keeps civil geography, ministry units, and affiliation scope distinct', () => {
    expect(migrated.sqlite.prepare(`SELECT country.code, program.name, program.fcf_availability
      FROM countries country JOIN national_programs program ON program.country_code = country.code
      WHERE country.code IN ('MY', 'DE', 'GB') ORDER BY country.code`).all()).toEqual([
      { code: 'DE', name: 'Royal Rangers Deutschland', fcf_availability: 'not-verified' },
      { code: 'GB', name: 'Royal Rangers UK', fcf_availability: 'not-verified' },
      { code: 'MY', name: 'Royal Rangers Malaysia', fcf_availability: 'available' },
    ])
    expect(migrated.sqlite.prepare(`SELECT unit.display_label, unit.name, unit.scope
      FROM organization_units unit WHERE unit.national_program_id = 'rr-malaysia'
      ORDER BY unit.scope, unit.name`).all()).toEqual([
      { display_label: 'Affiliate program', name: 'Frontiersman Camping Fellowship', scope: 'fcf' },
      { display_label: 'District', name: 'Central', scope: 'geographic' },
    ])
  })

  it('preserves source-native identifiers without publishing stale examples', () => {
    expect(migrated.sqlite.prepare(`SELECT program.country_code, outpost.local_unit_label,
      outpost.identifier_raw, geography.display_label
      FROM outposts outpost JOIN national_programs program ON program.id = outpost.national_program_id
      JOIN civil_geographies geography ON geography.id = outpost.civil_geography_id
      WHERE outpost.content_id LIKE 'fixture-%' ORDER BY outpost.content_id`).all()).toEqual([
      { country_code: 'DE', local_unit_label: 'Stammposten', identifier_raw: 'RR150', display_label: null },
      { country_code: 'GB', local_unit_label: 'Outpost', identifier_raw: 'Wales 01', display_label: 'Home nation' },
      { country_code: 'MY', local_unit_label: 'Outpost', identifier_raw: 'Kuala Lumpur#1', display_label: 'Federal territory' },
      { country_code: 'MY', local_unit_label: 'Outpost', identifier_raw: 'Selangor#6', display_label: 'State' },
    ])
    expect(migrated.sqlite.prepare(`SELECT COUNT(*) count FROM public_outpost_directory
      WHERE content_id LIKE 'fixture-%'`).get()).toEqual({ count: 0 })
  })

  it('rejects identical non-US scoped identity while allowing country-scoped numbers', () => {
    migrated.sqlite.prepare(`INSERT INTO content_records
      (id, kind, slug, title, summary, status, details_json, updated_at, version)
      VALUES ('duplicate', 'outpost', 'duplicate-rr150', 'Duplicate', 'Duplicate proof', 'draft', '{}', ?, 1)`)
      .run('2026-08-13T00:00:00.000Z')
    expect(() => migrated.sqlite.prepare(`INSERT INTO outposts
      (content_id, hub_outpost_id, national_program_id, external_number, church, city,
       civil_geography_id, fcf_activity_status) VALUES
      ('duplicate', 'duplicate', 'rr-deutschland', 'RR150', 'Example', '', 'country-de', 'not-verified')`).run())
      .toThrow()
  })

  it('keeps same numbers country-scoped and supports Unicode, omitted subdivisions, FCF states, and pagination', async () => {
    seedPublishedInternational({ id: 'test-de-7', country: 'DE', program: 'rr-deutschland', number: '7', church: 'Gemeinde Düsseldorf', city: 'Düsseldorf', fcf: 'yes' })
    seedPublishedInternational({ id: 'test-gb-7', country: 'GB', program: 'rr-uk', number: '7', church: 'Lakeside Church', city: 'Southport', fcf: 'no' })
    seedPublishedInternational({ id: 'test-my-8', country: 'MY', program: 'rr-malaysia', number: '8', church: 'Grace Klang', city: 'Klang', subdivision: 'Selangor' })
    seedPublishedInternational({ id: 'test-my-9', country: 'MY', program: 'rr-malaysia', number: '9', church: 'Calvary Kuala Lumpur', city: 'Bukit Jalil' })
    const germany = await listPublicOutposts(migrated.db, new URLSearchParams({ country: 'DE', q: 'Düsseldorf', pageSize: '1' }))
    expect(germany.records.map((record) => record.id)).toEqual(['test-de-7'])
    const uk = await listPublicOutposts(migrated.db, new URLSearchParams({ country: 'GB', q: '7' }))
    expect(uk.records.map((record) => record.id)).toEqual(['test-gb-7'])
    const firstPage = await listPublicOutposts(migrated.db, new URLSearchParams({ country: 'MY', limit: '1' }))
    expect(firstPage.records).toHaveLength(1)
    expect(firstPage.nextCursor).not.toBeNull()
    const secondPage = await listPublicOutposts(migrated.db, new URLSearchParams({ country: 'MY', limit: '1', cursor: firstPage.nextCursor! }))
    expect(secondPage.records).toHaveLength(1)
    expect(new Set([...firstPage.records, ...secondPage.records].map((record) => record.id))).toEqual(new Set(['test-my-8', 'test-my-9']))
    expect([...firstPage.records, ...secondPage.records].find((record) => record.id === 'test-my-8')?.details).toMatchObject({ jurisdiction: 'Selangor', activeFcf: null })
    expect(JSON.stringify([...germany.records, ...uk.records, ...firstPage.records])).not.toMatch(/staged|operatorTenure|private/i)
  })

  it('keeps ordinary-account matching bounded to the selected international country', async () => {
    seedPublishedInternational({ id: 'match-de-9', country: 'DE', program: 'rr-deutschland', number: '9', church: 'Düsseldorf Gemeinde', city: 'Düsseldorf' })
    seedPublishedInternational({ id: 'match-gb-9', country: 'GB', program: 'rr-uk', number: '9', church: 'British Church', city: 'York' })
    expect((await listOrdinaryOutpostMatches(migrated.db, { onboardingPath: 'international', scope: 'DE', query: '9' })).map((item) => item.id)).toEqual(['match-de-9'])
    expect((await listOrdinaryOutpostMatches(migrated.db, { onboardingPath: 'international', scope: 'GB', query: '9' })).map((item) => item.id)).toEqual(['match-gb-9'])
  })
})
