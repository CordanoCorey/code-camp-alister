-- Slice 14: country-defined international directory foundation.
-- Civil geography, ministry organization, and overlapping affiliations remain
-- separate concepts. Missing facts stay NULL or Not Verified.

CREATE TABLE countries (
  code TEXT PRIMARY KEY CHECK (length(code) = 2 AND code = upper(code)),
  name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0)
);

INSERT INTO countries (code, name) VALUES ('US', 'United States');

ALTER TABLE civil_geographies ADD COLUMN display_label TEXT;
UPDATE civil_geographies SET display_label = CASE geography_type
  WHEN 'state' THEN 'State'
  WHEN 'district' THEN 'Federal district'
  WHEN 'territory' THEN 'Territory'
  WHEN 'municipality' THEN 'Municipality'
  ELSE NULL
END;

ALTER TABLE national_programs ADD COLUMN fcf_availability TEXT NOT NULL DEFAULT 'not-verified'
  CHECK (fcf_availability IN ('available', 'not-offered', 'not-verified'));
UPDATE national_programs SET fcf_availability = 'available' WHERE id = 'rr-usa';

ALTER TABLE organization_units ADD COLUMN display_label TEXT NOT NULL DEFAULT 'Organization unit';
UPDATE organization_units SET display_label = CASE unit_type
  WHEN 'region' THEN 'Region'
  WHEN 'district' THEN 'District'
  WHEN 'language-region' THEN 'Language region'
  WHEN 'language-district' THEN 'Language district'
  WHEN 'fcf-territory' THEN 'FCF territory'
  ELSE 'Organization unit'
END;

ALTER TABLE outposts ADD COLUMN local_unit_label TEXT NOT NULL DEFAULT 'Outpost';
ALTER TABLE outposts ADD COLUMN identifier_raw TEXT;
ALTER TABLE outposts ADD COLUMN display_name_raw TEXT;

INSERT INTO countries (code, name) VALUES
  ('MY', 'Malaysia'),
  ('DE', 'Germany'),
  ('GB', 'United Kingdom');

INSERT INTO national_programs (id, name, country_code, default_language, fcf_availability) VALUES
  ('rr-malaysia', 'Royal Rangers Malaysia', 'MY', 'en', 'available'),
  ('rr-deutschland', 'Royal Rangers Deutschland', 'DE', 'de', 'not-verified'),
  ('rr-uk', 'Royal Rangers UK', 'GB', 'en', 'not-verified');

INSERT INTO civil_geographies
  (id, geography_type, name, code, country_code, parent_id, display_order, display_label) VALUES
  ('country-my', 'country', 'Malaysia', 'MY', 'MY', NULL, 0, NULL),
  ('my-kul', 'territory', 'Kuala Lumpur', 'KUL', 'MY', 'country-my', 1, 'Federal territory'),
  ('my-sgr', 'state', 'Selangor', 'SGR', 'MY', 'country-my', 2, 'State'),
  ('country-de', 'country', 'Germany', 'DE', 'DE', NULL, 0, NULL),
  ('country-gb', 'country', 'United Kingdom', 'GB', 'GB', NULL, 0, NULL),
  ('gb-wls', 'territory', 'Wales', 'WLS', 'GB', 'country-gb', 1, 'Home nation');

INSERT INTO content_records
  (id, kind, slug, title, summary, status, details_json, verified_at, published_at, updated_at, version) VALUES
  ('org-my-central', 'organization', 'malaysia-central-district', 'Central', 'Royal Rangers Malaysia names Central as its currently active district.', 'published', '{}', '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', 1),
  ('org-my-fcf', 'organization', 'malaysia-fcf-affiliate', 'Frontiersman Camping Fellowship', 'Verified affiliate program of Royal Rangers Malaysia; chapter names and boundaries are not verified.', 'published', '{}', '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', 1),
  ('org-de-nord', 'organization', 'deutschland-distrikt-nord', 'Nord', 'Source-defined Distrikt within Royal Rangers Deutschland.', 'published', '{}', '2014-01-01T00:00:00.000Z', '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', 1),
  ('fixture-my-kl-1', 'outpost', 'fixture-malaysia-kuala-lumpur-1', 'Kuala Lumpur#1 (Bukit Jalil)', 'Model-proof fixture from the dated national directory; current operation is not asserted.', 'draft', '{}', NULL, NULL, '2026-08-13T00:00:00.000Z', 1),
  ('fixture-my-selangor-6', 'outpost', 'fixture-malaysia-selangor-6', 'Selangor#6 (Klang)', 'Model-proof fixture from the dated national directory; current operation is not asserted.', 'draft', '{}', NULL, NULL, '2026-08-13T00:00:00.000Z', 1),
  ('fixture-de-rr150', 'outpost', 'fixture-deutschland-rr150', 'RR150', 'Source example proving Germany source-native Stammposten identifiers; not a current listing.', 'draft', '{}', NULL, NULL, '2026-08-13T00:00:00.000Z', 1),
  ('fixture-gb-wales-01', 'outpost', 'fixture-uk-wales-01', 'Wales 01', 'Historical source example proving that the country prefix is part of the identifier.', 'draft', '{}', NULL, NULL, '2026-08-13T00:00:00.000Z', 1);

INSERT INTO organization_units (id, unit_type, scope, name, national_program_id, display_label) VALUES
  ('org-my-central', 'country-defined', 'geographic', 'Central', 'rr-malaysia', 'District'),
  ('org-my-fcf', 'country-defined', 'fcf', 'Frontiersman Camping Fellowship', 'rr-malaysia', 'Affiliate program'),
  ('org-de-nord', 'country-defined', 'geographic', 'Nord', 'rr-deutschland', 'Distrikt');

INSERT INTO organization_unit_relationships
  (subject_id, relationship_type, related_national_program_id, display_order) VALUES
  ('org-my-central', 'part-of', 'rr-malaysia', 0),
  ('org-my-fcf', 'affiliated-with', 'rr-malaysia', 0),
  ('org-de-nord', 'part-of', 'rr-deutschland', 0);

INSERT INTO outposts
  (content_id, hub_outpost_id, national_program_id, external_number, church, city, civil_geography_id,
   fcf_activity_status, local_unit_label, identifier_raw, display_name_raw) VALUES
  ('fixture-my-kl-1', 'fixture-my-kl-1', 'rr-malaysia', 'Kuala Lumpur#1', 'Not verified', 'Bukit Jalil', 'my-kul', 'not-verified', 'Outpost', 'Kuala Lumpur#1', 'Kuala Lumpur#1 (Bukit Jalil)'),
  ('fixture-my-selangor-6', 'fixture-my-selangor-6', 'rr-malaysia', 'Selangor#6', 'Not verified', 'Klang', 'my-sgr', 'not-verified', 'Outpost', 'Selangor#6', 'Selangor#6 (Klang)'),
  ('fixture-de-rr150', 'fixture-de-rr150', 'rr-deutschland', 'RR150', 'Not verified', '', 'country-de', 'not-verified', 'Stammposten', 'RR150', 'RR150'),
  ('fixture-gb-wales-01', 'fixture-gb-wales-01', 'rr-uk', 'Wales 01', 'Not verified', '', 'gb-wls', 'not-verified', 'Outpost', 'Wales 01', 'Wales 01');

INSERT INTO outpost_lifecycle (outpost_id, state, version, updated_at) VALUES
  ('fixture-my-kl-1', 'unverified', 1, '2026-08-13T00:00:00.000Z'),
  ('fixture-my-selangor-6', 'unverified', 1, '2026-08-13T00:00:00.000Z'),
  ('fixture-de-rr150', 'unverified', 1, '2026-08-13T00:00:00.000Z'),
  ('fixture-gb-wales-01', 'unverified', 1, '2026-08-13T00:00:00.000Z');

INSERT INTO source_documents (id, url, label, publisher, created_at) VALUES
  ('source-my-outposts', 'https://www.royalrangers.com.my/outposts', 'Royal Rangers Malaysia outpost directory', 'Royal Rangers Malaysia', '2026-08-13T00:00:00.000Z'),
  ('source-my-patches', 'https://www.royalrangers.com.my/wp-content/uploads/2025/06/RR-Malaysian-Patch-Catalog_web_Mar25.pdf', 'Royal Rangers Malaysia patch catalog', 'Royal Rangers Malaysia', '2026-08-13T00:00:00.000Z'),
  ('source-my-fcf', 'https://www.royalrangers.com.my/wp-content/files/Malaysia%20RR%20Uniform%20Guide%20Rev00%2022%20Feb%202020.pdf', 'Royal Rangers Malaysia uniform guide', 'Royal Rangers Malaysia', '2026-08-13T00:00:00.000Z'),
  ('source-de-structure', 'https://intern.royal-rangers.de/PDF/Presse/2014_Ausgezeichnet_3_RR_Portraet.pdf', 'Royal Rangers Deutschland organizational portrait', 'Royal Rangers Deutschland', '2026-08-13T00:00:00.000Z'),
  ('source-gb-history', 'https://www.royalrangers.co.uk/about/our-history/', 'Royal Rangers UK history', 'Royal Rangers UK', '2026-08-13T00:00:00.000Z');

INSERT INTO field_provenance (id, content_id, field_path, source_document_id, source_label, verified_at) VALUES
  ('prov-my-central-name', 'org-my-central', 'title', 'source-my-patches', 'Royal Rangers Malaysia patch catalog', '2026-08-13T00:00:00.000Z'),
  ('prov-my-fcf-name', 'org-my-fcf', 'title', 'source-my-fcf', 'Royal Rangers Malaysia uniform guide', '2026-08-13T00:00:00.000Z'),
  ('prov-de-nord-name', 'org-de-nord', 'title', 'source-de-structure', 'Royal Rangers Deutschland organizational portrait', '2026-08-13T00:00:00.000Z'),
  ('prov-my-kl-id', 'fixture-my-kl-1', 'identifierRaw', 'source-my-outposts', 'Royal Rangers Malaysia outpost directory', '2026-08-13T00:00:00.000Z'),
  ('prov-my-selangor-id', 'fixture-my-selangor-6', 'identifierRaw', 'source-my-outposts', 'Royal Rangers Malaysia outpost directory', '2026-08-13T00:00:00.000Z'),
  ('prov-de-rr150-id', 'fixture-de-rr150', 'identifierRaw', 'source-de-structure', 'Royal Rangers Deutschland organizational portrait', '2026-08-13T00:00:00.000Z'),
  ('prov-gb-wales-id', 'fixture-gb-wales-01', 'identifierRaw', 'source-gb-history', 'Royal Rangers UK history', '2026-08-13T00:00:00.000Z');

INSERT INTO public_search_documents (content_id, kind, title, summary, safe_text)
SELECT content.id, content.kind, content.title, content.summary, program.name || ' ' || unit.display_label
FROM content_records content JOIN organization_units unit ON unit.id = content.id
JOIN national_programs program ON program.id = unit.national_program_id
WHERE content.id IN ('org-my-central', 'org-my-fcf', 'org-de-nord');

CREATE INDEX outposts_country_scoped_number
  ON outposts(national_program_id, external_number, ifnull(campus_suffix, ''))
  WHERE external_number IS NOT NULL;
CREATE UNIQUE INDEX outposts_non_us_scoped_identity
  ON outposts(national_program_id, external_number, ifnull(campus_suffix, ''))
  WHERE external_number IS NOT NULL AND national_program_id <> 'rr-usa';

CREATE INDEX national_programs_country ON national_programs(country_code, id);
CREATE INDEX countries_name ON countries(name COLLATE NOCASE, code);

CREATE TABLE migration_0013_assertions (
  name TEXT PRIMARY KEY,
  passed INTEGER NOT NULL CHECK (passed = 1)
);

INSERT INTO migration_0013_assertions (name, passed) VALUES
  ('usa-country-preserved', CASE WHEN EXISTS (
    SELECT 1 FROM countries country JOIN national_programs program ON program.country_code = country.code
    WHERE program.id = 'rr-usa' AND country.code = 'US'
  ) THEN 1 ELSE 0 END),
  ('country-scoped-number-index', CASE WHEN EXISTS (
    SELECT 1 FROM sqlite_schema WHERE type = 'index' AND name = 'outposts_country_scoped_number'
  ) THEN 1 ELSE 0 END),
  ('civil-and-ministry-models-remain-separate', CASE WHEN
    NOT EXISTS (SELECT 1 FROM pragma_foreign_key_list('organization_units') WHERE "table" = 'civil_geographies')
    AND EXISTS (SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'organization_civil_coverage')
  THEN 1 ELSE 0 END),
  ('no-foreign-key-orphans', CASE WHEN NOT EXISTS (SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE 0 END);

PRAGMA optimize;
