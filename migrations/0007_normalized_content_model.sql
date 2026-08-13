PRAGMA defer_foreign_keys = ON;

-- The existing content envelope retains stable identity and publication metadata.
-- details_json becomes a frozen Slice 1-4 compatibility snapshot after this migration.
ALTER TABLE content_records ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);

CREATE INDEX content_records_public_kind_title
  ON content_records(status, kind, title COLLATE NOCASE, id);
CREATE INDEX content_records_operator_updated
  ON content_records(updated_at DESC, id DESC);
CREATE INDEX content_records_verification
  ON content_records(verified_at, id);

CREATE TABLE national_programs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  country_code TEXT NOT NULL,
  default_language TEXT NOT NULL
);

INSERT INTO national_programs (id, name, country_code, default_language)
VALUES ('rr-usa', 'Royal Rangers USA', 'US', 'en');

CREATE TABLE civil_geographies (
  id TEXT PRIMARY KEY,
  geography_type TEXT NOT NULL CHECK (geography_type IN ('country', 'state', 'district', 'territory', 'municipality')),
  name TEXT NOT NULL,
  code TEXT,
  country_code TEXT NOT NULL,
  parent_id TEXT REFERENCES civil_geographies(id),
  display_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (country_code, geography_type, name)
);

INSERT INTO civil_geographies (id, geography_type, name, code, country_code, parent_id, display_order) VALUES
  ('country-us', 'country', 'United States', 'US', 'US', NULL, 0),
  ('us-al', 'state', 'Alabama', 'AL', 'US', 'country-us', 1),
  ('us-ak', 'state', 'Alaska', 'AK', 'US', 'country-us', 2),
  ('us-az', 'state', 'Arizona', 'AZ', 'US', 'country-us', 3),
  ('us-ar', 'state', 'Arkansas', 'AR', 'US', 'country-us', 4),
  ('us-ca', 'state', 'California', 'CA', 'US', 'country-us', 5),
  ('us-co', 'state', 'Colorado', 'CO', 'US', 'country-us', 6),
  ('us-ct', 'state', 'Connecticut', 'CT', 'US', 'country-us', 7),
  ('us-de', 'state', 'Delaware', 'DE', 'US', 'country-us', 8),
  ('us-dc', 'district', 'District of Columbia', 'DC', 'US', 'country-us', 9),
  ('us-fl', 'state', 'Florida', 'FL', 'US', 'country-us', 10),
  ('us-ga', 'state', 'Georgia', 'GA', 'US', 'country-us', 11),
  ('us-hi', 'state', 'Hawaii', 'HI', 'US', 'country-us', 12),
  ('us-id', 'state', 'Idaho', 'ID', 'US', 'country-us', 13),
  ('us-il', 'state', 'Illinois', 'IL', 'US', 'country-us', 14),
  ('us-in', 'state', 'Indiana', 'IN', 'US', 'country-us', 15),
  ('us-ia', 'state', 'Iowa', 'IA', 'US', 'country-us', 16),
  ('us-ks', 'state', 'Kansas', 'KS', 'US', 'country-us', 17),
  ('us-ky', 'state', 'Kentucky', 'KY', 'US', 'country-us', 18),
  ('us-la', 'state', 'Louisiana', 'LA', 'US', 'country-us', 19),
  ('us-me', 'state', 'Maine', 'ME', 'US', 'country-us', 20),
  ('us-md', 'state', 'Maryland', 'MD', 'US', 'country-us', 21),
  ('us-ma', 'state', 'Massachusetts', 'MA', 'US', 'country-us', 22),
  ('us-mi', 'state', 'Michigan', 'MI', 'US', 'country-us', 23),
  ('us-mn', 'state', 'Minnesota', 'MN', 'US', 'country-us', 24),
  ('us-ms', 'state', 'Mississippi', 'MS', 'US', 'country-us', 25),
  ('us-mo', 'state', 'Missouri', 'MO', 'US', 'country-us', 26),
  ('us-mt', 'state', 'Montana', 'MT', 'US', 'country-us', 27),
  ('us-ne', 'state', 'Nebraska', 'NE', 'US', 'country-us', 28),
  ('us-nv', 'state', 'Nevada', 'NV', 'US', 'country-us', 29),
  ('us-nh', 'state', 'New Hampshire', 'NH', 'US', 'country-us', 30),
  ('us-nj', 'state', 'New Jersey', 'NJ', 'US', 'country-us', 31),
  ('us-nm', 'state', 'New Mexico', 'NM', 'US', 'country-us', 32),
  ('us-ny', 'state', 'New York', 'NY', 'US', 'country-us', 33),
  ('us-nc', 'state', 'North Carolina', 'NC', 'US', 'country-us', 34),
  ('us-nd', 'state', 'North Dakota', 'ND', 'US', 'country-us', 35),
  ('us-oh', 'state', 'Ohio', 'OH', 'US', 'country-us', 36),
  ('us-ok', 'state', 'Oklahoma', 'OK', 'US', 'country-us', 37),
  ('us-or', 'state', 'Oregon', 'OR', 'US', 'country-us', 38),
  ('us-pa', 'state', 'Pennsylvania', 'PA', 'US', 'country-us', 39),
  ('us-ri', 'state', 'Rhode Island', 'RI', 'US', 'country-us', 40),
  ('us-sc', 'state', 'South Carolina', 'SC', 'US', 'country-us', 41),
  ('us-sd', 'state', 'South Dakota', 'SD', 'US', 'country-us', 42),
  ('us-tn', 'state', 'Tennessee', 'TN', 'US', 'country-us', 43),
  ('us-tx', 'state', 'Texas', 'TX', 'US', 'country-us', 44),
  ('us-ut', 'state', 'Utah', 'UT', 'US', 'country-us', 45),
  ('us-vt', 'state', 'Vermont', 'VT', 'US', 'country-us', 46),
  ('us-va', 'state', 'Virginia', 'VA', 'US', 'country-us', 47),
  ('us-wa', 'state', 'Washington', 'WA', 'US', 'country-us', 48),
  ('us-wv', 'state', 'West Virginia', 'WV', 'US', 'country-us', 49),
  ('us-wi', 'state', 'Wisconsin', 'WI', 'US', 'country-us', 50),
  ('us-wy', 'state', 'Wyoming', 'WY', 'US', 'country-us', 51),
  ('us-as', 'territory', 'American Samoa', 'AS', 'US', 'country-us', 52),
  ('us-gu', 'territory', 'Guam', 'GU', 'US', 'country-us', 53),
  ('us-mp', 'territory', 'Northern Mariana Islands', 'MP', 'US', 'country-us', 54),
  ('us-pr', 'territory', 'Puerto Rico', 'PR', 'US', 'country-us', 55),
  ('us-vi', 'territory', 'U.S. Virgin Islands', 'VI', 'US', 'country-us', 56);

CREATE INDEX civil_geographies_navigation
  ON civil_geographies(country_code, geography_type, display_order, id);

CREATE TABLE organization_units (
  id TEXT PRIMARY KEY REFERENCES content_records(id) ON DELETE CASCADE,
  unit_type TEXT NOT NULL CHECK (unit_type IN ('region', 'district', 'language-region', 'language-district', 'fcf-territory', 'country-defined')),
  scope TEXT NOT NULL CHECK (scope IN ('geographic', 'language', 'fcf')),
  name TEXT NOT NULL,
  national_program_id TEXT REFERENCES national_programs(id),
  UNIQUE (national_program_id, scope, unit_type, name)
);

INSERT INTO organization_units (id, unit_type, scope, name, national_program_id)
SELECT
  id,
  json_extract(details_json, '$.organizationType'),
  json_extract(details_json, '$.scope'),
  title,
  'rr-usa'
FROM content_records
WHERE kind = 'organization';

CREATE INDEX organization_units_navigation
  ON organization_units(scope, unit_type, name COLLATE NOCASE, id);

CREATE TABLE organization_unit_relationships (
  subject_id TEXT NOT NULL REFERENCES organization_units(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('part-of', 'paired-with', 'affiliated-with')),
  related_unit_id TEXT REFERENCES organization_units(id),
  related_national_program_id TEXT REFERENCES national_programs(id),
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (subject_id, relationship_type, display_order),
  CHECK ((related_unit_id IS NOT NULL) <> (related_national_program_id IS NOT NULL))
);

INSERT INTO organization_unit_relationships
  (subject_id, relationship_type, related_unit_id, related_national_program_id, display_order)
SELECT child.id, 'part-of', parent.id, NULL, 0
FROM content_records child_record
JOIN organization_units child ON child.id = child_record.id
JOIN organization_units parent ON parent.name = json_extract(child_record.details_json, '$.parent')
WHERE json_extract(child_record.details_json, '$.parent') IS NOT NULL;

INSERT INTO organization_unit_relationships
  (subject_id, relationship_type, related_unit_id, related_national_program_id, display_order)
SELECT child.id, 'part-of', NULL, 'rr-usa', 0
FROM content_records child_record
JOIN organization_units child ON child.id = child_record.id
WHERE json_extract(child_record.details_json, '$.parent') = 'Royal Rangers USA';

INSERT INTO organization_unit_relationships
  (subject_id, relationship_type, related_unit_id, related_national_program_id, display_order)
SELECT child.id, 'paired-with', related.id, NULL, CAST(affiliation.key AS INTEGER)
FROM content_records child_record
JOIN organization_units child ON child.id = child_record.id
JOIN json_each(child_record.details_json, '$.affiliations') affiliation
JOIN organization_units related ON related.name = affiliation.value;

CREATE INDEX organization_relationship_targets
  ON organization_unit_relationships(related_unit_id, relationship_type, subject_id);

CREATE TABLE organization_civil_coverage (
  organization_id TEXT NOT NULL REFERENCES organization_units(id) ON DELETE CASCADE,
  civil_geography_id TEXT NOT NULL REFERENCES civil_geographies(id) ON DELETE CASCADE,
  coverage_type TEXT NOT NULL CHECK (coverage_type IN ('directory', 'partial', 'source-described')) DEFAULT 'directory',
  display_label TEXT,
  PRIMARY KEY (organization_id, civil_geography_id, coverage_type)
);

INSERT INTO organization_civil_coverage
  (organization_id, civil_geography_id, coverage_type, display_label)
SELECT
  unit.id,
  geography.id,
  CASE WHEN jurisdiction.value LIKE '% (%)' THEN 'partial' ELSE 'source-described' END,
  jurisdiction.value
FROM content_records record
JOIN organization_units unit ON unit.id = record.id
JOIN json_each(record.details_json, '$.jurisdictions') jurisdiction
JOIN civil_geographies geography ON geography.name = CASE
  WHEN instr(jurisdiction.value, ' (') > 0
    THEN substr(jurisdiction.value, 1, instr(jurisdiction.value, ' (') - 1)
  ELSE jurisdiction.value
END
WHERE unit.unit_type = 'region';

CREATE INDEX organization_coverage_civil
  ON organization_civil_coverage(civil_geography_id, organization_id);

CREATE TABLE outposts (
  content_id TEXT PRIMARY KEY REFERENCES content_records(id) ON DELETE CASCADE,
  hub_outpost_id TEXT NOT NULL UNIQUE,
  national_program_id TEXT REFERENCES national_programs(id),
  external_number TEXT,
  campus_suffix TEXT,
  church TEXT NOT NULL,
  street_address TEXT,
  city TEXT NOT NULL,
  civil_geography_id TEXT NOT NULL REFERENCES civil_geographies(id),
  postal_code TEXT,
  meeting_information TEXT,
  public_contact_url TEXT CHECK (public_contact_url IS NULL OR public_contact_url LIKE 'https://%'),
  fcf_activity_status TEXT NOT NULL CHECK (fcf_activity_status IN ('yes', 'no', 'not-verified')),
  CHECK (content_id = hub_outpost_id)
);

INSERT INTO outposts
  (content_id, hub_outpost_id, national_program_id, external_number, campus_suffix, church,
   street_address, city, civil_geography_id, postal_code, meeting_information, public_contact_url,
   fcf_activity_status)
SELECT
  record.id,
  COALESCE(json_extract(record.details_json, '$.hubOutpostId'), record.id),
  'rr-usa',
  json_extract(record.details_json, '$.outpostNumber'),
  json_extract(record.details_json, '$.campusSuffix'),
  json_extract(record.details_json, '$.church'),
  json_extract(record.details_json, '$.streetAddress'),
  json_extract(record.details_json, '$.city'),
  geography.id,
  json_extract(record.details_json, '$.postalCode'),
  json_extract(record.details_json, '$.meeting'),
  json_extract(record.details_json, '$.contactUrl'),
  CASE json_type(record.details_json, '$.activeFcf')
    WHEN 'true' THEN 'yes'
    WHEN 'false' THEN 'no'
    ELSE 'not-verified'
  END
FROM content_records record
JOIN civil_geographies geography
  ON geography.name = json_extract(record.details_json, '$.jurisdiction')
  AND geography.country_code = 'US'
WHERE record.kind = 'outpost';

CREATE INDEX outposts_church ON outposts(church COLLATE NOCASE, content_id);
CREATE INDEX outposts_number_scope
  ON outposts(national_program_id, external_number, campus_suffix, content_id);
CREATE INDEX outposts_city ON outposts(city COLLATE NOCASE, content_id);
CREATE INDEX outposts_civil ON outposts(civil_geography_id, content_id);
CREATE INDEX outposts_fcf ON outposts(fcf_activity_status, content_id);

CREATE TABLE outpost_affiliations (
  outpost_id TEXT NOT NULL REFERENCES outposts(content_id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organization_units(id),
  affiliation_type TEXT NOT NULL CHECK (affiliation_type IN ('geographic-district', 'geographic-region', 'language-overlay', 'fcf-territory', 'other')),
  PRIMARY KEY (outpost_id, organization_id, affiliation_type)
);

INSERT INTO outpost_affiliations (outpost_id, organization_id, affiliation_type)
SELECT record.id, unit.id, 'geographic-district'
FROM content_records record
JOIN organization_units unit ON unit.name = json_extract(record.details_json, '$.district')
WHERE record.kind = 'outpost' AND json_extract(record.details_json, '$.district') <> ''
UNION ALL
SELECT record.id, unit.id, 'geographic-region'
FROM content_records record
JOIN organization_units unit ON unit.name = json_extract(record.details_json, '$.region')
WHERE record.kind = 'outpost' AND json_extract(record.details_json, '$.region') <> ''
UNION ALL
SELECT record.id, unit.id, 'language-overlay'
FROM content_records record
JOIN organization_units unit ON unit.name = json_extract(record.details_json, '$.languageOverlay')
WHERE record.kind = 'outpost' AND json_extract(record.details_json, '$.languageOverlay') <> ''
UNION ALL
SELECT record.id, unit.id, 'fcf-territory'
FROM content_records record
JOIN organization_units unit ON unit.name = json_extract(record.details_json, '$.fcfTerritory')
WHERE record.kind = 'outpost' AND json_extract(record.details_json, '$.fcfTerritory') <> '';

CREATE INDEX outpost_affiliations_lookup
  ON outpost_affiliations(organization_id, affiliation_type, outpost_id);

CREATE TABLE advancement_items (
  content_id TEXT PRIMARY KEY REFERENCES content_records(id) ON DELETE CASCADE,
  subtype TEXT NOT NULL CHECK (subtype IN ('program-group', 'achievement-trail', 'merit', 'award', 'handbook')),
  grade_range TEXT,
  official_url TEXT NOT NULL CHECK (official_url LIKE 'https://%'),
  content_status TEXT NOT NULL CHECK (content_status IN ('current', 'historical', 'superseded', 'not-verified')),
  accent TEXT,
  merit_category TEXT CHECK (merit_category IS NULL OR merit_category IN ('skill', 'bible', 'leadership')),
  award_level TEXT CHECK (award_level IS NULL OR award_level IN ('program-group', 'national', 'junior-leadership', 'fcf')),
  publisher TEXT,
  item_number TEXT,
  edition TEXT,
  revision TEXT,
  publication_year INTEGER,
  availability TEXT CHECK (availability IS NULL OR availability IN ('available', 'unavailable', 'not-verified'))
);

INSERT INTO advancement_items
  (content_id, subtype, grade_range, official_url, content_status, accent, merit_category,
   award_level, publisher, item_number, edition, revision, publication_year, availability)
SELECT
  id,
  json_extract(details_json, '$.subtype'),
  json_extract(details_json, '$.gradeRange'),
  json_extract(details_json, '$.officialUrl'),
  json_extract(details_json, '$.contentStatus'),
  json_extract(details_json, '$.accent'),
  json_extract(details_json, '$.meritCategory'),
  json_extract(details_json, '$.awardLevel'),
  json_extract(details_json, '$.publisher'),
  json_extract(details_json, '$.itemNumber'),
  json_extract(details_json, '$.edition'),
  json_extract(details_json, '$.revision'),
  json_extract(details_json, '$.publicationYear'),
  json_extract(details_json, '$.availability')
FROM content_records
WHERE kind = 'advancement';

CREATE INDEX advancement_items_filters
  ON advancement_items(subtype, content_status, merit_category, content_id);

CREATE TABLE advancement_program_groups (
  advancement_id TEXT NOT NULL REFERENCES advancement_items(content_id) ON DELETE CASCADE,
  program_group_id TEXT NOT NULL REFERENCES advancement_items(content_id),
  display_order INTEGER NOT NULL,
  PRIMARY KEY (advancement_id, program_group_id)
);

INSERT INTO advancement_program_groups (advancement_id, program_group_id, display_order)
SELECT record.id, group_record.id, CAST(program.key AS INTEGER)
FROM content_records record
JOIN json_each(record.details_json, '$.programGroups') program
JOIN content_records group_record ON group_record.kind = 'advancement'
  AND group_record.title = program.value
  AND json_extract(group_record.details_json, '$.subtype') = 'program-group'
WHERE record.kind = 'advancement';

CREATE INDEX advancement_program_groups_filter
  ON advancement_program_groups(program_group_id, advancement_id);

CREATE TABLE outpost_program_groups (
  outpost_id TEXT NOT NULL REFERENCES outposts(content_id) ON DELETE CASCADE,
  program_group_id TEXT NOT NULL REFERENCES advancement_items(content_id),
  display_order INTEGER NOT NULL,
  PRIMARY KEY (outpost_id, program_group_id)
);

INSERT INTO outpost_program_groups (outpost_id, program_group_id, display_order)
SELECT record.id, group_record.id, CAST(program.key AS INTEGER)
FROM content_records record
JOIN json_each(record.details_json, '$.programs') program
JOIN content_records group_record ON group_record.kind = 'advancement'
  AND group_record.title = program.value
  AND json_extract(group_record.details_json, '$.subtype') = 'program-group'
WHERE record.kind = 'outpost';

CREATE INDEX outpost_program_groups_filter
  ON outpost_program_groups(program_group_id, outpost_id);

CREATE TABLE advancement_audiences (
  advancement_id TEXT NOT NULL REFERENCES advancement_items(content_id) ON DELETE CASCADE,
  audience TEXT NOT NULL CHECK (audience IN ('Leaders', 'FCF')),
  display_order INTEGER NOT NULL,
  PRIMARY KEY (advancement_id, audience)
);

INSERT INTO advancement_audiences (advancement_id, audience, display_order)
SELECT record.id, audience.value, CAST(audience.key AS INTEGER)
FROM content_records record
JOIN json_each(record.details_json, '$.audiences') audience
WHERE record.kind = 'advancement';

CREATE INDEX advancement_audiences_filter
  ON advancement_audiences(audience, advancement_id);

CREATE TABLE advancement_merit_colors (
  advancement_id TEXT NOT NULL REFERENCES advancement_items(content_id) ON DELETE CASCADE,
  color TEXT NOT NULL CHECK (color IN ('blue', 'green', 'silver', 'orange', 'brown', 'red', 'gold', 'sky-blue')),
  display_order INTEGER NOT NULL,
  PRIMARY KEY (advancement_id, color)
);

INSERT INTO advancement_merit_colors (advancement_id, color, display_order)
SELECT record.id, color.value, CAST(color.key AS INTEGER)
FROM content_records record
JOIN json_each(record.details_json, '$.colors') color
WHERE record.kind = 'advancement' AND json_extract(record.details_json, '$.subtype') = 'merit';

CREATE INDEX advancement_merit_colors_filter
  ON advancement_merit_colors(color, advancement_id);

CREATE TABLE public_advancement_directory (
  content_id TEXT PRIMARY KEY REFERENCES advancement_items(content_id) ON DELETE CASCADE,
  group_order INTEGER NOT NULL,
  subtype_order INTEGER NOT NULL,
  title_sort TEXT NOT NULL,
  subtype TEXT NOT NULL,
  content_status TEXT NOT NULL,
  merit_category TEXT
);

INSERT INTO public_advancement_directory
  (content_id, group_order, subtype_order, title_sort, subtype, content_status, merit_category)
SELECT
  item.content_id,
  COALESCE((
    SELECT MIN(CASE group_content.title
      WHEN 'Ranger Kids' THEN 0
      WHEN 'Discovery Rangers' THEN 1
      WHEN 'Adventure Rangers' THEN 2
      WHEN 'Expedition Rangers' THEN 3
      ELSE 4 END)
    FROM advancement_program_groups relation
    JOIN content_records group_content ON group_content.id = relation.program_group_id
    WHERE relation.advancement_id = item.content_id
  ), 4),
  CASE item.subtype
    WHEN 'program-group' THEN 0
    WHEN 'achievement-trail' THEN 1
    WHEN 'merit' THEN 2
    WHEN 'award' THEN 3
    ELSE 4 END,
  lower(content.title),
  item.subtype,
  item.content_status,
  item.merit_category
FROM advancement_items item
JOIN content_records content ON content.id = item.content_id
WHERE content.status = 'published';

CREATE INDEX public_advancement_order
  ON public_advancement_directory(group_order, subtype_order, title_sort, content_id);
CREATE INDEX public_advancement_subtype_order
  ON public_advancement_directory(subtype, group_order, subtype_order, title_sort, content_id);
CREATE INDEX public_advancement_merit_order
  ON public_advancement_directory(merit_category, group_order, subtype_order, title_sort, content_id);

CREATE TABLE advancement_relationships (
  source_id TEXT NOT NULL REFERENCES advancement_items(content_id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES advancement_items(content_id),
  target_subtype TEXT NOT NULL CHECK (target_subtype IN ('program-group', 'achievement-trail', 'merit', 'award', 'handbook')),
  relationship_label TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  PRIMARY KEY (source_id, target_id, relationship_label)
);

INSERT INTO advancement_relationships
  (source_id, target_id, target_subtype, relationship_label, display_order)
SELECT
  record.id,
  json_extract(reference.value, '$.targetId'),
  json_extract(reference.value, '$.targetSubtype'),
  json_extract(reference.value, '$.relationship'),
  CAST(reference.key AS INTEGER)
FROM content_records record
JOIN json_each(record.details_json, '$.references') reference
WHERE record.kind = 'advancement';

CREATE INDEX advancement_relationship_targets
  ON advancement_relationships(target_id, source_id);

CREATE TABLE advancement_highlights (
  advancement_id TEXT NOT NULL REFERENCES advancement_items(content_id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (advancement_id, display_order)
);

INSERT INTO advancement_highlights (advancement_id, display_order, text)
SELECT record.id, CAST(highlight.key AS INTEGER), highlight.value
FROM content_records record
JOIN json_each(record.details_json, '$.highlights') highlight
WHERE record.kind = 'advancement';

CREATE TABLE handbook_formats (
  advancement_id TEXT NOT NULL REFERENCES advancement_items(content_id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('print', 'ebook')),
  display_order INTEGER NOT NULL,
  PRIMARY KEY (advancement_id, format)
);

INSERT INTO handbook_formats (advancement_id, format, display_order)
SELECT record.id, format.value, CAST(format.key AS INTEGER)
FROM content_records record
JOIN json_each(record.details_json, '$.formats') format
WHERE record.kind = 'advancement';

CREATE TABLE handbook_purchase_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  advancement_id TEXT NOT NULL REFERENCES advancement_items(content_id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL,
  label TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('print', 'ebook')),
  url TEXT NOT NULL CHECK (url LIKE 'https://%'),
  UNIQUE (advancement_id, display_order)
);

INSERT INTO handbook_purchase_links (advancement_id, display_order, label, format, url)
SELECT
  record.id,
  CAST(link.key AS INTEGER),
  json_extract(link.value, '$.label'),
  json_extract(link.value, '$.format'),
  json_extract(link.value, '$.url')
FROM content_records record
JOIN json_each(record.details_json, '$.purchaseUrls') link
WHERE record.kind = 'advancement';

CREATE TABLE event_series (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

INSERT INTO event_series (id, name)
SELECT DISTINCT
  json_extract(details_json, '$.series.id'),
  json_extract(details_json, '$.series.name')
FROM content_records
WHERE kind = 'event' AND json_extract(details_json, '$.series.id') IS NOT NULL;

CREATE TABLE event_occurrences (
  content_id TEXT PRIMARY KEY REFERENCES content_records(id) ON DELETE CASCADE,
  occurrence_id TEXT NOT NULL UNIQUE,
  series_id TEXT REFERENCES event_series(id),
  category TEXT NOT NULL CHECK (category IN ('camp', 'conference', 'fcf', 'pow-wow', 'training', 'other')),
  host TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('outpost', 'district', 'region', 'national', 'fcf', 'other')),
  start_date TEXT NOT NULL,
  end_date TEXT,
  start_time TEXT,
  end_time TEXT,
  time_zone TEXT NOT NULL,
  all_day INTEGER NOT NULL CHECK (all_day IN (0, 1)),
  location_status TEXT NOT NULL CHECK (location_status IN ('announced', 'to-be-announced', 'online', 'withheld', 'not-verified')),
  location TEXT,
  registration_status TEXT NOT NULL CHECK (registration_status IN ('not-verified', 'not-open', 'open', 'closed', 'full', 'not-required')),
  registration_url TEXT CHECK (registration_url IS NULL OR registration_url LIKE 'https://%'),
  registration_deadline TEXT,
  deadline_exception_note TEXT,
  cost_status TEXT NOT NULL CHECK (cost_status IN ('not-verified', 'free', 'paid', 'varies')),
  cost_note TEXT,
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('scheduled', 'accepting-registration', 'confirmed', 'full', 'postponed', 'cancelled', 'completed')),
  official_url TEXT NOT NULL CHECK (official_url LIKE 'https://%')
);

INSERT INTO event_occurrences
  (content_id, occurrence_id, series_id, category, host, scope, start_date, end_date, start_time,
   end_time, time_zone, all_day, location_status, location, registration_status, registration_url,
   registration_deadline, deadline_exception_note, cost_status, cost_note, lifecycle_status, official_url)
SELECT
  id,
  json_extract(details_json, '$.occurrenceId'),
  json_extract(details_json, '$.series.id'),
  json_extract(details_json, '$.category'),
  json_extract(details_json, '$.host'),
  json_extract(details_json, '$.scope'),
  json_extract(details_json, '$.startDate'),
  json_extract(details_json, '$.endDate'),
  json_extract(details_json, '$.startTime'),
  json_extract(details_json, '$.endTime'),
  json_extract(details_json, '$.timeZone'),
  CASE json_type(details_json, '$.allDay') WHEN 'true' THEN 1 ELSE 0 END,
  json_extract(details_json, '$.locationStatus'),
  json_extract(details_json, '$.location'),
  json_extract(details_json, '$.registrationStatus'),
  json_extract(details_json, '$.registrationUrl'),
  json_extract(details_json, '$.registrationDeadline'),
  json_extract(details_json, '$.deadlineExceptionNote'),
  json_extract(details_json, '$.costStatus'),
  json_extract(details_json, '$.costNote'),
  json_extract(details_json, '$.lifecycleStatus'),
  json_extract(details_json, '$.officialUrl')
FROM content_records
WHERE kind = 'event';

CREATE INDEX event_occurrences_upcoming
  ON event_occurrences(start_date, content_id);
CREATE INDEX event_occurrences_past
  ON event_occurrences(start_date DESC, content_id DESC);
CREATE INDEX event_occurrences_filters
  ON event_occurrences(scope, category, lifecycle_status, start_date, content_id);
CREATE INDEX event_occurrences_host
  ON event_occurrences(host COLLATE NOCASE, start_date, content_id);

CREATE TABLE event_organization_relations (
  occurrence_id TEXT NOT NULL REFERENCES event_occurrences(content_id) ON DELETE CASCADE,
  referenced_id TEXT NOT NULL,
  organization_id TEXT REFERENCES organization_units(id),
  display_name TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  PRIMARY KEY (occurrence_id, referenced_id)
);

INSERT INTO event_organization_relations
  (occurrence_id, referenced_id, organization_id, display_name, display_order)
SELECT
  record.id,
  json_extract(related.value, '$.id'),
  unit.id,
  json_extract(related.value, '$.name'),
  CAST(related.key AS INTEGER)
FROM content_records record
JOIN json_each(record.details_json, '$.relatedOrganizations') related
LEFT JOIN organization_units unit ON unit.id = json_extract(related.value, '$.id')
WHERE record.kind = 'event';

CREATE INDEX event_organization_filter
  ON event_organization_relations(organization_id, occurrence_id);

CREATE TABLE event_audiences (
  occurrence_id TEXT NOT NULL REFERENCES event_occurrences(content_id) ON DELETE CASCADE,
  audience TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  PRIMARY KEY (occurrence_id, audience)
);

INSERT INTO event_audiences (occurrence_id, audience, display_order)
SELECT record.id, audience.value, CAST(audience.key AS INTEGER)
FROM content_records record
JOIN json_each(record.details_json, '$.audience') audience
WHERE record.kind = 'event';

CREATE INDEX event_audiences_filter ON event_audiences(audience, occurrence_id);

CREATE TABLE information_pages (
  content_id TEXT PRIMARY KEY REFERENCES content_records(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('about', 'other', 'help'))
);

INSERT INTO information_pages (content_id, section)
SELECT id, json_extract(details_json, '$.section')
FROM content_records
WHERE kind = 'page';

CREATE INDEX information_pages_section ON information_pages(section, content_id);

CREATE TABLE information_page_body_sections (
  page_id TEXT NOT NULL REFERENCES information_pages(content_id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL,
  body_text TEXT NOT NULL,
  PRIMARY KEY (page_id, display_order)
);

INSERT INTO information_page_body_sections (page_id, display_order, body_text)
SELECT record.id, CAST(body.key AS INTEGER), body.value
FROM content_records record
JOIN json_each(record.details_json, '$.body') body
WHERE record.kind = 'page';

CREATE TABLE information_page_links (
  page_id TEXT NOT NULL REFERENCES information_pages(content_id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  PRIMARY KEY (page_id, display_order),
  CHECK (url LIKE 'https://%' OR url LIKE '/%')
);

INSERT INTO information_page_links (page_id, display_order, label, url)
SELECT
  record.id,
  CAST(link.key AS INTEGER),
  json_extract(link.value, '$.label'),
  json_extract(link.value, '$.url')
FROM content_records record
JOIN json_each(record.details_json, '$.links') link
WHERE record.kind = 'page';

CREATE TABLE source_documents (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE CHECK (url LIKE 'https://%'),
  label TEXT NOT NULL,
  publisher TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO source_documents (id, url, label, publisher, created_at)
SELECT
  'document-' || MIN(id),
  url,
  MIN(label),
  NULL,
  MIN(verified_at)
FROM record_sources
GROUP BY url;

INSERT OR IGNORE INTO source_documents (id, url, label, publisher, created_at)
SELECT
  'document-' || id,
  source_url,
  scope,
  NULL,
  COALESCE(last_checked_at, created_at)
FROM coverage_gaps
WHERE source_url LIKE 'https://%';

CREATE TABLE field_provenance (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_records(id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,
  source_document_id TEXT NOT NULL REFERENCES source_documents(id),
  source_label TEXT NOT NULL,
  verified_at TEXT NOT NULL
);

INSERT INTO field_provenance
  (id, content_id, field_path, source_document_id, source_label, verified_at)
SELECT source.id, source.record_id, source.field_name, document.id, source.label, source.verified_at
FROM record_sources source
JOIN source_documents document ON document.url = source.url;

CREATE INDEX field_provenance_content
  ON field_provenance(content_id, field_path, id);
CREATE INDEX field_provenance_document
  ON field_provenance(source_document_id, content_id, field_path);
CREATE INDEX field_provenance_freshness
  ON field_provenance(verified_at, content_id, id);

CREATE TABLE source_health_observations (
  id TEXT PRIMARY KEY,
  provenance_id TEXT NOT NULL REFERENCES field_provenance(id),
  source_document_id TEXT NOT NULL REFERENCES source_documents(id),
  content_id TEXT NOT NULL REFERENCES content_records(id),
  observed_at TEXT NOT NULL,
  observed_by TEXT NOT NULL,
  note TEXT NOT NULL,
  cleared_at TEXT,
  cleared_by TEXT
);

INSERT INTO source_health_observations
  (id, provenance_id, source_document_id, content_id, observed_at, observed_by, note, cleared_at, cleared_by)
SELECT observation.id, observation.source_id, provenance.source_document_id, observation.record_id,
  observation.observed_at, observation.observed_by, observation.note, observation.cleared_at, observation.cleared_by
FROM broken_source_observations observation
JOIN field_provenance provenance ON provenance.id = observation.source_id;

CREATE INDEX source_health_active
  ON source_health_observations(source_document_id, cleared_at, observed_at DESC);

CREATE TABLE normalized_event_conflicts (
  id TEXT PRIMARY KEY,
  occurrence_id TEXT NOT NULL REFERENCES event_occurrences(content_id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  opened_at TEXT NOT NULL,
  opened_by TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);

INSERT INTO normalized_event_conflicts
  (id, occurrence_id, field_path, status, opened_at, opened_by, resolved_at, resolved_by)
SELECT id, event_id, field_name, status, opened_at, opened_by, resolved_at, resolved_by
FROM event_conflicts;

CREATE INDEX normalized_event_conflict_queue
  ON normalized_event_conflicts(status, opened_at DESC, occurrence_id);

CREATE TABLE event_conflict_assertions (
  id TEXT PRIMARY KEY,
  conflict_id TEXT NOT NULL REFERENCES normalized_event_conflicts(id) ON DELETE CASCADE,
  provenance_id TEXT REFERENCES field_provenance(id),
  source_label TEXT NOT NULL,
  asserted_value TEXT NOT NULL,
  display_order INTEGER NOT NULL
);

INSERT INTO event_conflict_assertions
  (id, conflict_id, provenance_id, source_label, asserted_value, display_order)
SELECT
  conflict.id || ':' || assertion.key,
  conflict.id,
  provenance.id,
  json_extract(assertion.value, '$.sourceLabel'),
  json_extract(assertion.value, '$.assertedValue'),
  CAST(assertion.key AS INTEGER)
FROM event_conflicts conflict
JOIN json_each(conflict.assertions_json) assertion
LEFT JOIN field_provenance provenance
  ON provenance.id = json_extract(assertion.value, '$.sourceId');

CREATE TABLE event_conflict_resolutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conflict_id TEXT NOT NULL REFERENCES normalized_event_conflicts(id) ON DELETE CASCADE,
  resolution_note TEXT NOT NULL,
  resolved_at TEXT NOT NULL,
  resolved_by TEXT NOT NULL
);

INSERT INTO event_conflict_resolutions (conflict_id, resolution_note, resolved_at, resolved_by)
SELECT id, resolution_note, resolved_at, resolved_by
FROM event_conflicts
WHERE status = 'resolved' AND resolution_note IS NOT NULL AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL;

CREATE TABLE normalized_coverage_gaps (
  id TEXT PRIMARY KEY,
  scope_text TEXT NOT NULL,
  content_id TEXT REFERENCES content_records(id),
  organization_id TEXT REFERENCES organization_units(id),
  source_document_id TEXT REFERENCES source_documents(id),
  description TEXT NOT NULL,
  last_checked_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution_reason TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);

INSERT INTO normalized_coverage_gaps
  (id, scope_text, content_id, organization_id, source_document_id, description, last_checked_at,
   status, resolution_reason, created_at, created_by, resolved_at, resolved_by)
SELECT
  gap.id,
  gap.scope,
  content.id,
  unit.id,
  document.id,
  gap.description,
  gap.last_checked_at,
  gap.status,
  gap.resolution_reason,
  gap.created_at,
  gap.created_by,
  gap.resolved_at,
  gap.resolved_by
FROM coverage_gaps gap
LEFT JOIN content_records content ON content.id = gap.scope
LEFT JOIN organization_units unit ON unit.id = gap.scope OR unit.name = gap.scope
LEFT JOIN source_documents document ON document.url = gap.source_url;

CREATE INDEX normalized_coverage_gap_queue
  ON normalized_coverage_gaps(status, created_at DESC, id);

CREATE TABLE content_revisions (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content_records(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  actor_label TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (content_id, version)
);

INSERT INTO content_revisions
  (id, content_id, version, status, snapshot_json, actor_label, reason, created_at)
SELECT
  id || ':1',
  id,
  1,
  status,
  json_object(
    'id', id,
    'kind', kind,
    'slug', slug,
    'title', title,
    'summary', summary,
    'status', status,
    'details', json(details_json),
    'verifiedAt', verified_at,
    'publishedAt', published_at,
    'updatedAt', updated_at
  ),
  'Slice 5 migration',
  'Normalized canonical backfill from the retained Slice 1-4 snapshot',
  updated_at
FROM content_records;

CREATE INDEX content_revisions_history
  ON content_revisions(content_id, version DESC);

CREATE TABLE content_audit_events (
  id INTEGER PRIMARY KEY,
  content_id TEXT REFERENCES content_records(id),
  stable_scope_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_label TEXT NOT NULL,
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  reason TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO content_audit_events
  (id, content_id, stable_scope_id, action, actor_label, before_json, after_json, reason, created_at)
SELECT audit.id, content.id, audit.record_id, audit.action, audit.actor,
  audit.before_json, audit.after_json, audit.reason, audit.created_at
FROM audit_events audit
LEFT JOIN content_records content ON content.id = audit.record_id;

CREATE INDEX content_audit_history
  ON content_audit_events(stable_scope_id, id DESC);

CREATE TRIGGER content_audit_events_no_update
BEFORE UPDATE ON content_audit_events BEGIN
  SELECT RAISE(ABORT, 'audit events are append-only');
END;

CREATE TRIGGER content_audit_events_no_delete
BEFORE DELETE ON content_audit_events BEGIN
  SELECT RAISE(ABORT, 'audit events are append-only');
END;

-- Read-only public directory projection. It contains no drafts and is updated in the
-- same batch as canonical writes, which lets common filter/sort shapes use one index.
CREATE TABLE public_outpost_directory (
  content_id TEXT PRIMARY KEY REFERENCES outposts(content_id) ON DELETE CASCADE,
  title_sort TEXT NOT NULL,
  church_sort TEXT NOT NULL,
  national_program_id TEXT,
  external_number TEXT,
  campus_suffix TEXT,
  city TEXT NOT NULL,
  civil_geography_id TEXT NOT NULL,
  fcf_activity_status TEXT NOT NULL,
  verified_at TEXT
);

INSERT INTO public_outpost_directory
  (content_id, title_sort, church_sort, national_program_id, external_number, campus_suffix,
   city, civil_geography_id, fcf_activity_status, verified_at)
SELECT outpost.content_id, lower(content.title), lower(outpost.church), outpost.national_program_id,
  outpost.external_number, outpost.campus_suffix, outpost.city, outpost.civil_geography_id,
  outpost.fcf_activity_status, content.verified_at
FROM outposts outpost
JOIN content_records content ON content.id = outpost.content_id
WHERE content.status = 'published';

CREATE INDEX public_outposts_title
  ON public_outpost_directory(title_sort, content_id);
CREATE INDEX public_outposts_church
  ON public_outpost_directory(church_sort, content_id);
CREATE INDEX public_outposts_civil_title
  ON public_outpost_directory(civil_geography_id, title_sort, content_id);
CREATE INDEX public_outposts_city_title
  ON public_outpost_directory(city COLLATE NOCASE, title_sort, content_id);
CREATE INDEX public_outposts_fcf_title
  ON public_outpost_directory(fcf_activity_status, title_sort, content_id);
CREATE INDEX public_outposts_number
  ON public_outpost_directory(national_program_id, external_number, campus_suffix, content_id);
CREATE INDEX public_outposts_freshness
  ON public_outpost_directory(verified_at, content_id);

CREATE TABLE public_search_documents (
  content_id TEXT PRIMARY KEY REFERENCES content_records(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  safe_text TEXT NOT NULL
);

CREATE VIRTUAL TABLE public_search_fts USING fts5(
  content_id UNINDEXED,
  kind UNINDEXED,
  title,
  summary,
  safe_text,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER public_search_documents_insert AFTER INSERT ON public_search_documents BEGIN
  INSERT INTO public_search_fts(content_id, kind, title, summary, safe_text)
  VALUES (new.content_id, new.kind, new.title, new.summary, new.safe_text);
END;

CREATE TRIGGER public_search_documents_update AFTER UPDATE ON public_search_documents BEGIN
  DELETE FROM public_search_fts WHERE content_id = old.content_id;
  INSERT INTO public_search_fts(content_id, kind, title, summary, safe_text)
  VALUES (new.content_id, new.kind, new.title, new.summary, new.safe_text);
END;

CREATE TRIGGER public_search_documents_delete AFTER DELETE ON public_search_documents BEGIN
  DELETE FROM public_search_fts WHERE content_id = old.content_id;
END;

INSERT INTO public_search_documents (content_id, kind, title, summary, safe_text)
SELECT
  content.id,
  content.kind,
  content.title,
  content.summary,
  CASE content.kind
    WHEN 'outpost' THEN COALESCE((
      SELECT outpost.church || ' ' || outpost.city || ' ' || geography.name || ' ' || COALESCE(outpost.external_number, '')
      FROM outposts outpost JOIN civil_geographies geography ON geography.id = outpost.civil_geography_id
      WHERE outpost.content_id = content.id
    ), '')
    WHEN 'event' THEN COALESCE((
      SELECT occurrence.host || ' ' || occurrence.scope || ' ' || occurrence.category || ' ' || COALESCE(occurrence.location, '') || ' ' || COALESCE(series.name, '')
      FROM event_occurrences occurrence LEFT JOIN event_series series ON series.id = occurrence.series_id
      WHERE occurrence.content_id = content.id
    ), '')
    WHEN 'advancement' THEN COALESCE((
      SELECT item.subtype || ' ' || COALESCE(item.grade_range, '') || ' ' || COALESCE(item.publisher, '') || ' ' || COALESCE(item.item_number, '')
      FROM advancement_items item WHERE item.content_id = content.id
    ), '')
    WHEN 'organization' THEN COALESCE((
      SELECT unit.scope || ' ' || unit.unit_type || ' ' || unit.name
      FROM organization_units unit WHERE unit.id = content.id
    ), '')
    WHEN 'page' THEN COALESCE((
      SELECT group_concat(section.body_text, ' ')
      FROM information_page_body_sections section WHERE section.page_id = content.id
    ), '')
    ELSE ''
  END
FROM content_records content
WHERE content.status = 'published';

-- A stale UPDATE that matches zero rows must still abort the logical D1 batch.
CREATE TABLE content_write_checks (
  content_id TEXT NOT NULL REFERENCES content_records(id),
  expected_version INTEGER NOT NULL
);

CREATE TRIGGER content_write_check_version
BEFORE INSERT ON content_write_checks
WHEN (SELECT version FROM content_records WHERE id = new.content_id) <> new.expected_version + 1
BEGIN
  SELECT RAISE(ABORT, 'content version conflict');
END;

CREATE TRIGGER content_write_check_cleanup
AFTER INSERT ON content_write_checks BEGIN
  DELETE FROM content_write_checks
  WHERE content_id = new.content_id AND expected_version = new.expected_version;
END;

CREATE TRIGGER content_version_increment
BEFORE UPDATE ON content_records
WHEN new.version <> old.version + 1
BEGIN
  SELECT RAISE(ABORT, 'content version must increment by one');
END;

-- Migration-time integrity assertions are durable, machine-checkable evidence.
CREATE TABLE migration_0007_assertions (
  name TEXT PRIMARY KEY,
  passed INTEGER NOT NULL CHECK (passed = 1),
  checked_at TEXT NOT NULL
);

INSERT INTO migration_0007_assertions (name, passed, checked_at)
SELECT 'every content record has one typed row',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM content_records content
    WHERE (content.kind = 'outpost' AND NOT EXISTS (SELECT 1 FROM outposts typed WHERE typed.content_id = content.id))
       OR (content.kind = 'event' AND NOT EXISTS (SELECT 1 FROM event_occurrences typed WHERE typed.content_id = content.id))
       OR (content.kind = 'advancement' AND NOT EXISTS (SELECT 1 FROM advancement_items typed WHERE typed.content_id = content.id))
       OR (content.kind = 'organization' AND NOT EXISTS (SELECT 1 FROM organization_units typed WHERE typed.id = content.id))
       OR (content.kind = 'page' AND NOT EXISTS (SELECT 1 FROM information_pages typed WHERE typed.content_id = content.id))
  ) THEN 1 ELSE 0 END,
  '2026-08-12T00:00:00.000Z';

INSERT INTO migration_0007_assertions (name, passed, checked_at)
SELECT 'legacy source IDs and field assertions preserved',
  CASE WHEN (SELECT COUNT(*) FROM record_sources) = (SELECT COUNT(*) FROM field_provenance)
    AND NOT EXISTS (
      SELECT 1 FROM record_sources legacy
      LEFT JOIN field_provenance normalized ON normalized.id = legacy.id
      LEFT JOIN source_documents document ON document.id = normalized.source_document_id
      WHERE normalized.id IS NULL OR normalized.content_id <> legacy.record_id
        OR normalized.field_path <> legacy.field_name OR normalized.source_label <> legacy.label
        OR document.url <> legacy.url OR normalized.verified_at <> legacy.verified_at
    ) THEN 1 ELSE 0 END,
  '2026-08-12T00:00:00.000Z';

INSERT INTO migration_0007_assertions (name, passed, checked_at)
SELECT 'source documents deduplicated by HTTPS URL',
  CASE WHEN (SELECT COUNT(*) FROM source_documents) = (
    SELECT COUNT(DISTINCT url) FROM (
      SELECT url FROM record_sources
      UNION
      SELECT source_url AS url FROM coverage_gaps WHERE source_url LIKE 'https://%'
    )
  ) AND NOT EXISTS (SELECT 1 FROM source_documents WHERE url NOT LIKE 'https://%')
  THEN 1 ELSE 0 END,
  '2026-08-12T00:00:00.000Z';

INSERT INTO migration_0007_assertions (name, passed, checked_at)
SELECT 'event conflict assertions preserved',
  CASE WHEN (SELECT COUNT(*) FROM event_conflict_assertions) = (
    SELECT COUNT(*) FROM event_conflicts, json_each(event_conflicts.assertions_json)
  ) THEN 1 ELSE 0 END,
  '2026-08-12T00:00:00.000Z';

INSERT INTO migration_0007_assertions (name, passed, checked_at)
SELECT 'published search projection bounded to published content',
  CASE WHEN (SELECT COUNT(*) FROM public_search_documents) = (SELECT COUNT(*) FROM content_records WHERE status = 'published')
    AND NOT EXISTS (
      SELECT 1 FROM public_search_documents search
      JOIN content_records content ON content.id = search.content_id
      WHERE content.status <> 'published'
    ) THEN 1 ELSE 0 END,
  '2026-08-12T00:00:00.000Z';

INSERT INTO migration_0007_assertions (name, passed, checked_at)
SELECT 'FCF not-verified state preserved',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM content_records legacy
    JOIN outposts normalized ON normalized.content_id = legacy.id
    WHERE json_type(legacy.details_json, '$.activeFcf') = 'null'
      AND normalized.fcf_activity_status <> 'not-verified'
  ) THEN 1 ELSE 0 END,
  '2026-08-12T00:00:00.000Z';

INSERT INTO migration_0007_assertions (name, passed, checked_at)
SELECT 'foreign keys have no orphans',
  CASE WHEN NOT EXISTS (SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE 0 END,
  '2026-08-12T00:00:00.000Z';

-- One-way cutover: normalized tables are canonical. Retained legacy JSON/source/editorial
-- rows remain recovery evidence and may be removed only after production parity proof.
DROP TRIGGER content_records_search_insert;
DROP TRIGGER content_records_search_update;
DROP TRIGGER content_records_search_delete;

CREATE TRIGGER legacy_details_json_read_only
BEFORE UPDATE OF details_json ON content_records BEGIN
  SELECT RAISE(ABORT, 'details_json is a read-only legacy snapshot');
END;

CREATE TRIGGER legacy_record_sources_no_insert BEFORE INSERT ON record_sources BEGIN
  SELECT RAISE(ABORT, 'record_sources is read-only legacy data');
END;
CREATE TRIGGER legacy_record_sources_no_update BEFORE UPDATE ON record_sources BEGIN
  SELECT RAISE(ABORT, 'record_sources is read-only legacy data');
END;
CREATE TRIGGER legacy_record_sources_no_delete BEFORE DELETE ON record_sources BEGIN
  SELECT RAISE(ABORT, 'record_sources is read-only legacy data');
END;

CREATE TRIGGER legacy_event_conflicts_no_write BEFORE INSERT ON event_conflicts BEGIN
  SELECT RAISE(ABORT, 'event_conflicts is read-only legacy data');
END;
CREATE TRIGGER legacy_event_conflicts_no_update BEFORE UPDATE ON event_conflicts BEGIN
  SELECT RAISE(ABORT, 'event_conflicts is read-only legacy data');
END;
CREATE TRIGGER legacy_broken_sources_no_write BEFORE INSERT ON broken_source_observations BEGIN
  SELECT RAISE(ABORT, 'broken_source_observations is read-only legacy data');
END;
CREATE TRIGGER legacy_broken_sources_no_update BEFORE UPDATE ON broken_source_observations BEGIN
  SELECT RAISE(ABORT, 'broken_source_observations is read-only legacy data');
END;
CREATE TRIGGER legacy_coverage_gaps_no_write BEFORE INSERT ON coverage_gaps BEGIN
  SELECT RAISE(ABORT, 'coverage_gaps is read-only legacy data');
END;
CREATE TRIGGER legacy_coverage_gaps_no_update BEFORE UPDATE ON coverage_gaps BEGIN
  SELECT RAISE(ABORT, 'coverage_gaps is read-only legacy data');
END;

PRAGMA optimize;
