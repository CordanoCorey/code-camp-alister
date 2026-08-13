import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMigratedD1 } from './test-sqlite-d1'

describe('international directory foundation', () => {
  let migrated: ReturnType<typeof createMigratedD1>
  beforeEach(() => { migrated = createMigratedD1() })
  afterEach(() => migrated.close())

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
})
