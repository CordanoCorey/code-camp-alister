PRAGMA foreign_keys = ON;

-- Private editorial state. None of these tables are read by the public bundle.
CREATE TABLE event_conflicts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES content_records(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  assertions_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  opened_at TEXT NOT NULL,
  opened_by TEXT NOT NULL,
  resolution_note TEXT,
  resolved_at TEXT,
  resolved_by TEXT
);

CREATE INDEX event_conflicts_event_status ON event_conflicts(event_id, status);

CREATE TABLE broken_source_observations (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  observed_by TEXT NOT NULL,
  note TEXT NOT NULL,
  cleared_at TEXT,
  cleared_by TEXT
);

CREATE INDEX broken_sources_active ON broken_source_observations(source_id, cleared_at);

CREATE TABLE coverage_gaps (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  description TEXT NOT NULL,
  source_url TEXT,
  last_checked_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution_reason TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);

-- Upgrade the three original national training occurrences without changing identity.
UPDATE content_records SET
  title = 'National Elementary Education Conference · Missouri',
  summary = 'A Royal Rangers USA training conference for adult leaders serving early-elementary ministry and Ranger Kids.',
  details_json = '{"occurrenceId":"event-neec-mo-2026","series":{"id":"series-neec","name":"National Elementary Education Conference"},"category":"training","host":"Royal Rangers USA","scope":"national","relatedOrganizations":[{"id":"rr-usa","name":"Royal Rangers USA"}],"startDate":"2026-09-11","endDate":"2026-09-12","startTime":null,"endTime":null,"timeZone":"America/Chicago","allDay":true,"locationStatus":"announced","location":"Camp Eagle Rock, Eagle Rock, Missouri","audience":["Adult leaders","Ranger Kids leaders"],"registrationStatus":"open","registrationUrl":"https://royalrangers.com/training/events","registrationDeadline":"2026-08-11","deadlineExceptionNote":null,"costStatus":"not-verified","costNote":null,"lifecycleStatus":"accepting-registration","officialUrl":"https://royalrangers.com/training/events"}',
  verified_at = '2026-08-12T00:00:00.000Z',
  updated_at = '2026-08-12T00:00:00.000Z'
WHERE id = 'event-neec-mo-2026';

UPDATE content_records SET
  title = 'National Rangers Ministry Conference · Pennsylvania',
  summary = 'A Royal Rangers USA adult-leader training conference in Susquehanna, Pennsylvania.',
  details_json = '{"occurrenceId":"event-nrmc-pa-2026","series":{"id":"series-nrmc","name":"National Rangers Ministry Conference"},"category":"training","host":"Royal Rangers USA","scope":"national","relatedOrganizations":[{"id":"rr-usa","name":"Royal Rangers USA"}],"startDate":"2026-09-18","endDate":"2026-09-20","startTime":null,"endTime":null,"timeZone":"America/New_York","allDay":true,"locationStatus":"announced","location":"Rock Mountain Bible Camp, 1156 Rock Mountain Dr, Susquehanna, Pennsylvania 18847","audience":["Adult leaders"],"registrationStatus":"open","registrationUrl":"https://royalrangers.com/training/events","registrationDeadline":"2026-08-16","deadlineExceptionNote":null,"costStatus":"not-verified","costNote":null,"lifecycleStatus":"accepting-registration","officialUrl":"https://royalrangers.com/training/events"}',
  verified_at = '2026-08-12T00:00:00.000Z',
  updated_at = '2026-08-12T00:00:00.000Z'
WHERE id = 'event-nrmc-pa-2026';

UPDATE content_records SET
  title = 'Johnnie Barnes Excellence Initiative · Wisconsin',
  summary = 'A Royal Rangers USA leadership-development seminar for people serving or preparing to serve beyond the local outpost.',
  details_json = '{"occurrenceId":"event-jbei-wi-2026","series":{"id":"series-jbei","name":"Johnnie Barnes Excellence Initiative"},"category":"training","host":"Royal Rangers USA","scope":"national","relatedOrganizations":[{"id":"rr-usa","name":"Royal Rangers USA"}],"startDate":"2026-09-25","endDate":"2026-09-26","startTime":null,"endTime":null,"timeZone":"America/Chicago","allDay":true,"locationStatus":"announced","location":"Camp Wilderness, Waupaca, Wisconsin","audience":["District, regional, and national service leaders"],"registrationStatus":"open","registrationUrl":"https://royalrangers.com/training/events","registrationDeadline":"2026-08-26","deadlineExceptionNote":null,"costStatus":"not-verified","costNote":null,"lifecycleStatus":"accepting-registration","officialUrl":"https://royalrangers.com/training/events"}',
  verified_at = '2026-08-12T00:00:00.000Z',
  updated_at = '2026-08-12T00:00:00.000Z'
WHERE id = 'event-jbei-wi-2026';

-- Separate recurring Camporama occurrences retain their own dates and history.
INSERT INTO content_records
  (id, kind, slug, title, summary, status, details_json, verified_at, published_at, updated_at)
VALUES
  ('event-camporama-2026', 'event', 'national-camporama-2026', 'National Camporama 2026', 'The 2026 occurrence of Royal Rangers USA’s four-year national camp gathering.', 'published',
   '{"occurrenceId":"event-camporama-2026","series":{"id":"series-national-camporama","name":"National Camporama"},"category":"camp","host":"Royal Rangers USA","scope":"national","relatedOrganizations":[{"id":"rr-usa","name":"Royal Rangers USA"}],"startDate":"2026-07-12","endDate":"2026-07-17","startTime":null,"endTime":null,"timeZone":"America/Chicago","allDay":true,"locationStatus":"announced","location":"Camp Eagle Rock, Eagle Rock, Missouri","audience":[],"registrationStatus":"closed","registrationUrl":null,"registrationDeadline":null,"deadlineExceptionNote":null,"costStatus":"not-verified","costNote":null,"lifecycleStatus":"completed","officialUrl":"https://nationalcamporama.com/schedule/"}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('event-camporama-2022', 'event', 'national-camporama-2022', 'National Camporama 2022', 'The retained 2022 occurrence of the recurring National Camporama series.', 'published',
   '{"occurrenceId":"event-camporama-2022","series":{"id":"series-national-camporama","name":"National Camporama"},"category":"camp","host":"Royal Rangers USA","scope":"national","relatedOrganizations":[{"id":"rr-usa","name":"Royal Rangers USA"}],"startDate":"2022-07-10","endDate":"2022-07-15","startTime":null,"endTime":null,"timeZone":"America/Chicago","allDay":true,"locationStatus":"announced","location":"Eagle Rock, Missouri","audience":[],"registrationStatus":"closed","registrationUrl":null,"registrationDeadline":null,"deadlineExceptionNote":null,"costStatus":"not-verified","costNote":null,"lifecycleStatus":"completed","officialUrl":"https://nationalcamporama.com/-/media/NationalCamporama/Downloads/AOR-for-Camporama-2022.pdf"}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('event-ky-pow-wow-2026', 'event', 'kentucky-district-pow-wow-2026', 'Kentucky District Pow-Wow 2026', 'A Kentucky Royal Rangers district Pow-Wow occurrence with current organizer registration controls.', 'published',
   '{"occurrenceId":"event-ky-pow-wow-2026","series":{"id":"series-ky-district-pow-wow","name":"Kentucky District Pow-Wow"},"category":"pow-wow","host":"Kentucky Royal Rangers","scope":"district","relatedOrganizations":[{"id":"district-kentucky","name":"Kentucky District"}],"startDate":"2026-08-28","endDate":"2026-08-30","startTime":"17:00","endTime":null,"timeZone":"America/Chicago","allDay":false,"locationStatus":"announced","location":"Rotary Scout Reservation, 100 Boy Scout Camp Rd, Glasgow, Kentucky 42141","audience":[],"registrationStatus":"open","registrationUrl":"https://www.kyroyalrangers.com/event/kentucky-district-pow-wow/","registrationDeadline":null,"deadlineExceptionNote":null,"costStatus":"not-verified","costNote":null,"lifecycleStatus":"accepting-registration","officialUrl":"https://www.kyroyalrangers.com/event/kentucky-district-pow-wow/"}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('event-ntx-fcf-family-days-2026', 'event', 'shawnee-trail-fcf-family-days-2026', 'Shawnee Trail FCF Family Days Camp 2026', 'A North Texas Shawnee Trail Chapter FCF family camp occurrence at the Royal Rangers Camp at Lakeview.', 'published',
   '{"occurrenceId":"event-ntx-fcf-family-days-2026","series":{"id":"series-shawnee-trail-family-days","name":"Shawnee Trail FCF Family Days"},"category":"fcf","host":"North Texas Shawnee Trail Chapter FCF","scope":"fcf","relatedOrganizations":[{"id":"district-north-texas","name":"North Texas District"},{"id":"fcf-shawnee-trail","name":"Shawnee Trail Chapter FCF"}],"startDate":"2026-10-23","endDate":"2026-10-25","startTime":null,"endTime":null,"timeZone":"America/Chicago","allDay":true,"locationStatus":"announced","location":"Royal Rangers Camp at Lakeview, 860 Royal Rangers Loop, Waxahachie, Texas 75167","audience":["Royal Rangers families","Friends of Royal Rangers"],"registrationStatus":"open","registrationUrl":"https://ntxrr.org/","registrationDeadline":"2026-10-06","deadlineExceptionNote":null,"costStatus":"varies","costNote":"Organizer packet lists category pricing through October 6, followed by a $5 increase.","lifecycleStatus":"accepting-registration","officialUrl":"https://ntxrr.org/"}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z'),
  ('event-ky-pathfinders-2026', 'event', 'kentucky-pathfinders-2026', 'Kentucky PathFinders 2026', 'A Kentucky Royal Rangers training occurrence retained with the organizer’s cancelled status.', 'published',
   '{"occurrenceId":"event-ky-pathfinders-2026","series":{"id":"series-ky-pathfinders","name":"Kentucky PathFinders"},"category":"training","host":"Kentucky Royal Rangers","scope":"district","relatedOrganizations":[{"id":"district-kentucky","name":"Kentucky District"}],"startDate":"2026-09-18","endDate":"2026-09-20","startTime":null,"endTime":null,"timeZone":"America/New_York","allDay":true,"locationStatus":"not-verified","location":null,"audience":[],"registrationStatus":"closed","registrationUrl":null,"registrationDeadline":null,"deadlineExceptionNote":null,"costStatus":"not-verified","costNote":null,"lifecycleStatus":"cancelled","officialUrl":"https://www.kyroyalrangers.com/events-calendar/"}',
   '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z', '2026-08-12T00:00:00.000Z');

-- Replace listing-wide legacy event sources with one source row per displayed fact.
DELETE FROM record_sources WHERE record_id IN (
  'event-neec-mo-2026', 'event-nrmc-pa-2026', 'event-jbei-wi-2026',
  'event-camporama-2026', 'event-camporama-2022', 'event-ky-pow-wow-2026',
  'event-ntx-fcf-family-days-2026', 'event-ky-pathfinders-2026'
);

INSERT INTO record_sources (id, record_id, field_name, label, url, verified_at)
SELECT 'source-' || event_id || '-' || field.value, event_id, field.value, label, url, '2026-08-12T00:00:00.000Z'
FROM (
  SELECT 'event-neec-mo-2026' event_id, 'Royal Rangers USA live training schedule and event information' label, 'https://royalrangers.com/training/events' url,
    '["title","summary","occurrenceId","series","category","host","scope","relatedOrganizations","startDate","endDate","timeZone","allDay","locationStatus","location","audience","registrationStatus","registrationUrl","registrationDeadline","costStatus","lifecycleStatus","officialUrl"]' fields
  UNION ALL SELECT 'event-nrmc-pa-2026', 'Royal Rangers USA live training schedule and NRMC information', 'https://royalrangers.com/training/events',
    '["title","summary","occurrenceId","series","category","host","scope","relatedOrganizations","startDate","endDate","timeZone","allDay","locationStatus","location","audience","registrationStatus","registrationUrl","registrationDeadline","costStatus","lifecycleStatus","officialUrl"]'
  UNION ALL SELECT 'event-jbei-wi-2026', 'Royal Rangers USA live training schedule and JBEI information', 'https://royalrangers.com/training/events',
    '["title","summary","occurrenceId","series","category","host","scope","relatedOrganizations","startDate","endDate","timeZone","allDay","locationStatus","location","audience","registrationStatus","registrationUrl","registrationDeadline","costStatus","lifecycleStatus","officialUrl"]'
  UNION ALL SELECT 'event-camporama-2026', 'National Camporama schedule and Royal Rangers USA national events page', 'https://nationalcamporama.com/schedule/',
    '["title","summary","occurrenceId","series","category","host","scope","relatedOrganizations","startDate","endDate","timeZone","allDay","locationStatus","location","registrationStatus","costStatus","lifecycleStatus","officialUrl"]'
) event_sources, json_each(event_sources.fields) field;

-- Keep this compound query to four terms: local D1 rejects the equivalent eight-term expansion.
INSERT INTO record_sources (id, record_id, field_name, label, url, verified_at)
SELECT 'source-' || event_id || '-' || field.value, event_id, field.value, label, url, '2026-08-12T00:00:00.000Z'
FROM (
  SELECT 'event-camporama-2022' event_id, 'National Camporama 2022 organizer document and national events page' label, 'https://nationalcamporama.com/-/media/NationalCamporama/Downloads/AOR-for-Camporama-2022.pdf' url,
    '["title","summary","occurrenceId","series","category","host","scope","relatedOrganizations","startDate","endDate","timeZone","allDay","locationStatus","location","registrationStatus","costStatus","lifecycleStatus","officialUrl"]' fields
  UNION ALL SELECT 'event-ky-pow-wow-2026', 'Kentucky Royal Rangers dedicated event page', 'https://www.kyroyalrangers.com/event/kentucky-district-pow-wow/',
    '["title","summary","occurrenceId","series","category","host","scope","relatedOrganizations","startDate","endDate","startTime","timeZone","allDay","locationStatus","location","registrationStatus","registrationUrl","costStatus","lifecycleStatus","officialUrl"]'
  UNION ALL SELECT 'event-ntx-fcf-family-days-2026', 'North Texas Royal Rangers event notice and organizer packet', 'https://ntxrr.org/',
    '["title","summary","occurrenceId","series","category","host","scope","relatedOrganizations","startDate","endDate","timeZone","allDay","locationStatus","location","audience","registrationStatus","registrationUrl","registrationDeadline","costStatus","costNote","lifecycleStatus","officialUrl"]'
  UNION ALL SELECT 'event-ky-pathfinders-2026', 'Kentucky Royal Rangers 2026 events calendar', 'https://www.kyroyalrangers.com/events-calendar/',
    '["title","summary","occurrenceId","series","category","host","scope","relatedOrganizations","startDate","endDate","timeZone","allDay","locationStatus","registrationStatus","costStatus","lifecycleStatus","officialUrl"]'
) event_sources, json_each(event_sources.fields) field;

-- Organizer pages do not publish IANA identifiers; document the explicit normalization separately.
UPDATE record_sources SET label = 'IANA time zone normalized from the verified organizer-local venue'
WHERE field_name = 'timeZone' AND record_id LIKE 'event-%';

INSERT INTO event_conflicts
  (id, event_id, field_name, assertions_json, status, opened_at, opened_by)
VALUES
  ('conflict-jbei-wi-end-time', 'event-jbei-wi-2026', 'endTime',
   '[{"sourceId":null,"sourceLabel":"JBEI information PDF overview","assertedValue":"5:00 PM dismissal"},{"sourceId":null,"sourceLabel":"JBEI information PDF detailed schedule","assertedValue":"4:15 PM dismissal"}]',
   'open', '2026-08-12T00:00:00.000Z', 'MVP seed');

INSERT INTO coverage_gaps
  (id, scope, description, source_url, last_checked_at, status, created_at, created_by)
VALUES
  ('gap-region-events-2026', 'Regional event coverage', 'No current organizer-controlled region page supports a complete genuinely region-scoped 2026 occurrence.', 'https://northeastregion.org/events/', '2026-08-12T00:00:00.000Z', 'open', '2026-08-12T00:00:00.000Z', 'MVP seed');

INSERT INTO audit_events (record_id, action, actor, after_json, reason, created_at)
SELECT id, 'event occurrence upgraded', 'MVP seed', details_json,
  'Slice 3 source-backed event model and representative Reference Calendar', '2026-08-12T00:00:00.000Z'
FROM content_records WHERE kind = 'event';

INSERT INTO audit_events (record_id, action, actor, after_json, reason, created_at) VALUES
  ('event-jbei-wi-2026', 'event conflict opened', 'MVP seed', '{"fieldName":"endTime"}', 'Organizer PDF contains two dismissal times; public end time remains omitted.', '2026-08-12T00:00:00.000Z'),
  ('gap-region-events-2026', 'coverage gap recorded', 'MVP seed', '{"scope":"Regional event coverage"}', 'Current primary-source review found no publishable region-scoped 2026 occurrence.', '2026-08-12T00:00:00.000Z');
