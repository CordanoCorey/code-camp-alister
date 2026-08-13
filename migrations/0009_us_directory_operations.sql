-- Slice 8: private U.S. directory proposals, annual verification, reviewed batches, and coverage.
PRAGMA foreign_keys = ON;

CREATE TABLE outpost_lifecycle (
  outpost_id TEXT PRIMARY KEY REFERENCES outposts(content_id),
  state TEXT NOT NULL CHECK (state IN ('unverified', 'verified', 'grace', 'verification-expired', 'archived')),
  last_verified_at TEXT,
  next_verification_due_at TEXT,
  grace_ends_at TEXT,
  archived_effective_at TEXT,
  archive_reason TEXT CHECK (archive_reason IS NULL OR length(archive_reason) BETWEEN 1 AND 500),
  archive_source_document_id TEXT REFERENCES source_documents(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TEXT NOT NULL,
  CHECK (
    (state = 'unverified' AND last_verified_at IS NULL AND next_verification_due_at IS NULL
      AND grace_ends_at IS NULL AND archived_effective_at IS NULL AND archive_reason IS NULL
      AND archive_source_document_id IS NULL)
    OR
    (state IN ('verified', 'grace', 'verification-expired') AND last_verified_at IS NOT NULL
      AND next_verification_due_at IS NOT NULL AND grace_ends_at IS NOT NULL
      AND archived_effective_at IS NULL AND archive_reason IS NULL AND archive_source_document_id IS NULL)
    OR
    (state = 'archived' AND archived_effective_at IS NOT NULL AND archive_reason IS NOT NULL
      AND archive_source_document_id IS NOT NULL)
  )
);

WITH lifecycle_backfill AS (
  SELECT outpost.content_id, content.status, content.verified_at, content.updated_at,
    CAST(substr(content.verified_at, 1, 4) AS INTEGER) + 1 target_year
  FROM outposts outpost JOIN content_records content ON content.id = outpost.content_id
), lifecycle_schedule AS (
  SELECT *, CASE
    WHEN substr(verified_at, 6, 5) = '02-29'
      AND (target_year % 4 <> 0 OR (target_year % 100 = 0 AND target_year % 400 <> 0))
      THEN printf('%04d-02-28%s', target_year, substr(verified_at, 11))
    ELSE printf('%04d-%s', target_year, substr(verified_at, 6))
  END due_at FROM lifecycle_backfill
)
INSERT INTO outpost_lifecycle
  (outpost_id, state, last_verified_at, next_verification_due_at, grace_ends_at, updated_at)
SELECT content_id,
  CASE WHEN status = 'published' THEN 'verified' ELSE 'unverified' END,
  CASE WHEN status = 'published' THEN verified_at END,
  CASE WHEN status = 'published' THEN due_at END,
  CASE WHEN status = 'published' THEN strftime('%Y-%m-%dT%H:%M:%fZ', due_at, '+30 days') END,
  updated_at
FROM lifecycle_schedule;

CREATE INDEX outpost_lifecycle_freshness
  ON outpost_lifecycle(state, next_verification_due_at, grace_ends_at, outpost_id);
CREATE INDEX outpost_lifecycle_archive_review
  ON outpost_lifecycle(state, archived_effective_at, outpost_id);

CREATE TABLE listing_verification_cycles (
  id TEXT PRIMARY KEY,
  outpost_id TEXT NOT NULL REFERENCES outposts(content_id),
  cycle_number INTEGER NOT NULL CHECK (cycle_number >= 1),
  verified_at TEXT NOT NULL,
  next_due_at TEXT NOT NULL,
  grace_ends_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('verified', 'restored-from-expiry', 'restored-from-archive')),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  operator_tenure_id INTEGER REFERENCES operator_tenures(tenure_number),
  created_at TEXT NOT NULL,
  UNIQUE (outpost_id, cycle_number)
);

WITH cycle_backfill AS (
  SELECT content.*,
    CAST(substr(content.verified_at, 1, 4) AS INTEGER) + 1 target_year
  FROM content_records content WHERE content.kind = 'outpost' AND content.status = 'published'
), cycle_schedule AS (
  SELECT *, CASE
    WHEN substr(verified_at, 6, 5) = '02-29'
      AND (target_year % 4 <> 0 OR (target_year % 100 = 0 AND target_year % 400 <> 0))
      THEN printf('%04d-02-28%s', target_year, substr(verified_at, 11))
    ELSE printf('%04d-%s', target_year, substr(verified_at, 6))
  END due_at FROM cycle_backfill
)
INSERT INTO listing_verification_cycles
  (id, outpost_id, cycle_number, verified_at, next_due_at, grace_ends_at, outcome, reason, created_at)
SELECT 'legacy-cycle-' || id, id, 1, verified_at, due_at,
  strftime('%Y-%m-%dT%H:%M:%fZ', due_at, '+30 days'),
  'verified', 'Initial verified listing retained from the normalized content migration', updated_at
FROM cycle_schedule;

CREATE TABLE listing_verification_provenance (
  verification_cycle_id TEXT NOT NULL REFERENCES listing_verification_cycles(id),
  provenance_id TEXT NOT NULL CHECK (length(provenance_id) BETWEEN 1 AND 200),
  source_document_id TEXT NOT NULL REFERENCES source_documents(id),
  field_path TEXT NOT NULL CHECK (length(field_path) BETWEEN 1 AND 100),
  source_label TEXT NOT NULL CHECK (length(source_label) BETWEEN 1 AND 200),
  source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%' AND length(source_url) <= 2048),
  verified_at TEXT NOT NULL,
  PRIMARY KEY (verification_cycle_id, provenance_id)
);

INSERT INTO listing_verification_provenance
  (verification_cycle_id, provenance_id, source_document_id, field_path, source_label, source_url, verified_at)
SELECT 'legacy-cycle-' || provenance.content_id, provenance.id, provenance.source_document_id,
  provenance.field_path, provenance.source_label, document.url, provenance.verified_at
FROM field_provenance provenance
JOIN source_documents document ON document.id = provenance.source_document_id
JOIN content_records content ON content.id = provenance.content_id
WHERE content.kind = 'outpost' AND content.status = 'published';

CREATE INDEX listing_verification_cycles_outpost
  ON listing_verification_cycles(outpost_id, cycle_number DESC);

CREATE TRIGGER listing_verification_cycles_require_active_tenure
BEFORE INSERT ON listing_verification_cycles
WHEN new.operator_tenure_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM operator_account account JOIN operator_tenures tenure
    ON tenure.tenure_number = account.active_tenure_number
  WHERE account.singleton_key = 1 AND account.state = 'active'
    AND tenure.tenure_number = new.operator_tenure_id AND tenure.ended_at IS NULL
    AND account.renewal_due_at > new.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'Listing Verification requires an active Operator tenure');
END;

CREATE TRIGGER listing_verification_cycles_no_update
BEFORE UPDATE ON listing_verification_cycles BEGIN
  SELECT RAISE(ABORT, 'Listing Verification history is append-only');
END;
CREATE TRIGGER listing_verification_cycles_no_delete
BEFORE DELETE ON listing_verification_cycles BEGIN
  SELECT RAISE(ABORT, 'Listing Verification history is append-only');
END;
CREATE TRIGGER listing_verification_provenance_no_update
BEFORE UPDATE ON listing_verification_provenance BEGIN
  SELECT RAISE(ABORT, 'Listing Verification provenance is append-only');
END;
CREATE TRIGGER listing_verification_provenance_no_delete
BEFORE DELETE ON listing_verification_provenance BEGIN
  SELECT RAISE(ABORT, 'Listing Verification provenance is append-only');
END;

CREATE TABLE outpost_source_identifiers (
  id TEXT PRIMARY KEY,
  outpost_id TEXT NOT NULL REFERENCES outposts(content_id),
  source_kind TEXT NOT NULL CHECK (length(source_kind) BETWEEN 1 AND 80),
  external_value TEXT NOT NULL CHECK (length(external_value) BETWEEN 1 AND 200),
  scope_key TEXT NOT NULL DEFAULT '' CHECK (length(scope_key) <= 200),
  campus_suffix TEXT NOT NULL DEFAULT '' CHECK (length(campus_suffix) <= 80),
  source_document_id TEXT REFERENCES source_documents(id),
  permanence TEXT NOT NULL CHECK (permanence IN ('source-controlled', 'observed', 'historical')),
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  UNIQUE (source_kind, external_value, scope_key, campus_suffix, outpost_id)
);

CREATE INDEX outpost_source_identifier_match
  ON outpost_source_identifiers(source_kind, external_value, scope_key, campus_suffix);

CREATE TABLE outpost_identity_fingerprints (
  id TEXT PRIMARY KEY,
  outpost_id TEXT NOT NULL REFERENCES outposts(content_id),
  fingerprint_kind TEXT NOT NULL CHECK (fingerprint_kind IN ('church-location', 'scoped-number', 'source-url', 'address')),
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  created_at TEXT NOT NULL,
  UNIQUE (outpost_id, fingerprint_kind, fingerprint)
);

CREATE INDEX outpost_identity_fingerprint_match
  ON outpost_identity_fingerprints(fingerprint_kind, fingerprint, outpost_id);

CREATE TABLE directory_submissions (
  id TEXT PRIMARY KEY,
  reference_code TEXT NOT NULL UNIQUE CHECK (length(reference_code) BETWEEN 12 AND 40),
  submission_type TEXT NOT NULL CHECK (submission_type IN ('new-listing', 'correction')),
  target_outpost_id TEXT REFERENCES outposts(content_id),
  church TEXT NOT NULL CHECK (length(church) BETWEEN 1 AND 160),
  external_number TEXT CHECK (external_number IS NULL OR length(external_number) <= 40),
  campus_suffix TEXT CHECK (campus_suffix IS NULL OR length(campus_suffix) <= 80),
  street_address TEXT CHECK (street_address IS NULL OR length(street_address) <= 200),
  city TEXT NOT NULL CHECK (length(city) BETWEEN 1 AND 100),
  civil_geography_id TEXT NOT NULL REFERENCES civil_geographies(id),
  postal_code TEXT CHECK (postal_code IS NULL OR length(postal_code) <= 20),
  district_name TEXT CHECK (district_name IS NULL OR length(district_name) <= 160),
  language_overlay_name TEXT CHECK (language_overlay_name IS NULL OR length(language_overlay_name) <= 160),
  program_groups_text TEXT NOT NULL DEFAULT '' CHECK (length(program_groups_text) <= 200),
  meeting_information TEXT CHECK (meeting_information IS NULL OR length(meeting_information) <= 500),
  source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%' AND length(source_url) <= 500),
  fcf_activity_status TEXT NOT NULL CHECK (fcf_activity_status IN ('yes', 'no', 'not-verified')),
  reply_email TEXT CHECK (reply_email IS NULL OR length(reply_email) <= 254),
  private_notes TEXT CHECK (private_notes IS NULL OR length(private_notes) <= 1000),
  identity_fingerprint TEXT NOT NULL CHECK (length(identity_fingerprint) = 64),
  likely_duplicate INTEGER NOT NULL DEFAULT 0 CHECK (likely_duplicate IN (0, 1)),
  state TEXT NOT NULL CHECK (state IN (
    'new', 'triage', 'needs-information', 'duplicate', 'verified-ready',
    'converted', 'rejected', 'withdrawn', 'pii-scrubbed'
  )),
  retention_deadline TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disposed_at TEXT,
  pii_scrubbed_at TEXT,
  CHECK ((submission_type = 'correction' AND target_outpost_id IS NOT NULL)
    OR (submission_type = 'new-listing' AND target_outpost_id IS NULL)),
  CHECK ((state IN ('duplicate', 'converted', 'rejected', 'withdrawn', 'pii-scrubbed')
      AND disposed_at IS NOT NULL AND pii_scrubbed_at IS NOT NULL
      AND reply_email IS NULL AND private_notes IS NULL)
    OR (state NOT IN ('duplicate', 'converted', 'rejected', 'withdrawn', 'pii-scrubbed')
      AND disposed_at IS NULL AND pii_scrubbed_at IS NULL))
);

CREATE UNIQUE INDEX directory_submission_active_exact_duplicate
  ON directory_submissions(identity_fingerprint)
  WHERE state IN ('new', 'triage', 'needs-information', 'verified-ready');
CREATE INDEX directory_submission_queue
  ON directory_submissions(state, likely_duplicate, created_at, id);
CREATE INDEX directory_submission_jurisdiction_queue
  ON directory_submissions(civil_geography_id, submission_type, state, created_at, id);
CREATE INDEX directory_submission_retention
  ON directory_submissions(pii_scrubbed_at, retention_deadline, id);

CREATE TABLE directory_submission_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL REFERENCES directory_submissions(id),
  action TEXT NOT NULL CHECK (action IN (
    'received', 'triage-started', 'needs-information', 'marked-duplicate',
    'verified-ready', 'converted-to-draft', 'rejected', 'withdrawn', 'personal-data-scrubbed'
  )),
  reason TEXT CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 500),
  related_outpost_id TEXT REFERENCES outposts(content_id),
  operator_tenure_id INTEGER REFERENCES operator_tenures(tenure_number),
  created_at TEXT NOT NULL,
  CHECK ((action = 'received' AND operator_tenure_id IS NULL AND reason IS NULL)
    OR (action <> 'received' AND operator_tenure_id IS NOT NULL AND reason IS NOT NULL))
);

CREATE INDEX directory_submission_event_history
  ON directory_submission_events(submission_id, id);

CREATE TRIGGER directory_submission_events_require_active_tenure
BEFORE INSERT ON directory_submission_events
WHEN new.action <> 'received' AND NOT EXISTS (
  SELECT 1 FROM operator_account account JOIN operator_tenures tenure
    ON tenure.tenure_number = account.active_tenure_number
  WHERE account.singleton_key = 1 AND account.state = 'active'
    AND tenure.tenure_number = new.operator_tenure_id AND tenure.ended_at IS NULL
    AND account.renewal_due_at > new.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'Directory Submission decisions require an active Operator tenure');
END;

CREATE TRIGGER directory_submission_events_no_update
BEFORE UPDATE ON directory_submission_events BEGIN
  SELECT RAISE(ABORT, 'Directory Submission events are append-only');
END;
CREATE TRIGGER directory_submission_events_no_delete
BEFORE DELETE ON directory_submission_events BEGIN
  SELECT RAISE(ABORT, 'Directory Submission events are append-only');
END;

CREATE TABLE directory_submission_transition_checks (
  submission_id TEXT NOT NULL REFERENCES directory_submissions(id),
  expected_state TEXT NOT NULL,
  expected_event TEXT NOT NULL,
  checked_at TEXT NOT NULL
);

CREATE TRIGGER directory_submission_transition_check
BEFORE INSERT ON directory_submission_transition_checks
WHEN NOT EXISTS (
  SELECT 1 FROM directory_submissions submission
  JOIN directory_submission_events event ON event.submission_id = submission.id
  WHERE submission.id = new.submission_id AND submission.state = new.expected_state
    AND event.action = new.expected_event AND event.created_at = new.checked_at
)
BEGIN
  SELECT RAISE(ABORT, 'Directory Submission transition conflict');
END;

CREATE TRIGGER directory_submission_transition_check_cleanup
AFTER INSERT ON directory_submission_transition_checks BEGIN
  DELETE FROM directory_submission_transition_checks WHERE rowid = new.rowid;
END;

CREATE TABLE directory_candidate_matches (
  id TEXT PRIMARY KEY,
  submission_id TEXT REFERENCES directory_submissions(id),
  staged_candidate_id TEXT,
  outpost_id TEXT NOT NULL REFERENCES outposts(content_id),
  match_kind TEXT NOT NULL CHECK (match_kind IN ('church-location', 'address', 'scoped-number', 'source-identifier', 'source-url')),
  evidence_summary TEXT NOT NULL CHECK (length(evidence_summary) BETWEEN 1 AND 500),
  state TEXT NOT NULL CHECK (state IN ('candidate', 'confirmed-duplicate', 'dismissed')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  operator_tenure_id INTEGER REFERENCES operator_tenures(tenure_number),
  CHECK ((submission_id IS NOT NULL) <> (staged_candidate_id IS NOT NULL))
);

CREATE INDEX directory_candidate_match_submission
  ON directory_candidate_matches(submission_id, state, id);
CREATE INDEX directory_candidate_match_outpost
  ON directory_candidate_matches(outpost_id, state, id);

CREATE TABLE population_batches (
  id TEXT PRIMARY KEY,
  source_register TEXT NOT NULL CHECK (length(source_register) BETWEEN 1 AND 200),
  source_version TEXT NOT NULL CHECK (length(source_version) BETWEEN 1 AND 100),
  manifest_checksum TEXT NOT NULL UNIQUE CHECK (length(manifest_checksum) = 64),
  reviewed_at TEXT NOT NULL,
  candidate_count INTEGER NOT NULL CHECK (candidate_count >= 0),
  staged_count INTEGER NOT NULL DEFAULT 0 CHECK (staged_count >= 0),
  applied_count INTEGER NOT NULL DEFAULT 0 CHECK (applied_count >= 0),
  state TEXT NOT NULL CHECK (state IN ('staged', 'partially-applied', 'applied', 'rejected')),
  operator_tenure_id INTEGER NOT NULL REFERENCES operator_tenures(tenure_number),
  created_at TEXT NOT NULL,
  CHECK (staged_count <= candidate_count AND applied_count <= staged_count)
);

CREATE TABLE staged_outpost_candidates (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES population_batches(id),
  stable_candidate_key TEXT NOT NULL CHECK (length(stable_candidate_key) BETWEEN 1 AND 160),
  target_outpost_id TEXT REFERENCES outposts(content_id),
  operation TEXT NOT NULL CHECK (operation IN ('new-listing', 'correction')),
  church TEXT NOT NULL CHECK (length(church) BETWEEN 1 AND 160),
  external_number TEXT CHECK (external_number IS NULL OR length(external_number) <= 40),
  campus_suffix TEXT CHECK (campus_suffix IS NULL OR length(campus_suffix) <= 80),
  street_address TEXT CHECK (street_address IS NULL OR length(street_address) <= 200),
  city TEXT NOT NULL CHECK (length(city) BETWEEN 1 AND 100),
  civil_geography_id TEXT NOT NULL REFERENCES civil_geographies(id),
  postal_code TEXT CHECK (postal_code IS NULL OR length(postal_code) <= 20),
  district_name TEXT CHECK (district_name IS NULL OR length(district_name) <= 160),
  region_name TEXT CHECK (region_name IS NULL OR length(region_name) <= 160),
  fcf_territory_name TEXT CHECK (fcf_territory_name IS NULL OR length(fcf_territory_name) <= 160),
  language_overlay_name TEXT CHECK (language_overlay_name IS NULL OR length(language_overlay_name) <= 160),
  program_groups_text TEXT NOT NULL DEFAULT '' CHECK (length(program_groups_text) <= 200),
  meeting_information TEXT CHECK (meeting_information IS NULL OR length(meeting_information) <= 500),
  public_contact_url TEXT CHECK (public_contact_url IS NULL OR (public_contact_url LIKE 'https://%' AND length(public_contact_url) <= 500)),
  fcf_activity_status TEXT NOT NULL CHECK (fcf_activity_status IN ('yes', 'no', 'not-verified')),
  state TEXT NOT NULL CHECK (state IN ('staged', 'duplicate-review', 'converted-to-draft', 'rejected')),
  created_at TEXT NOT NULL,
  applied_at TEXT,
  applied_outpost_id TEXT REFERENCES outposts(content_id),
  UNIQUE (stable_candidate_key),
  CHECK ((operation = 'correction' AND target_outpost_id IS NOT NULL)
    OR (operation = 'new-listing' AND target_outpost_id IS NULL)),
  CHECK ((state = 'converted-to-draft' AND applied_at IS NOT NULL AND applied_outpost_id IS NOT NULL)
    OR (state <> 'converted-to-draft' AND applied_at IS NULL AND applied_outpost_id IS NULL))
);

CREATE TABLE staged_outpost_fields (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES staged_outpost_candidates(id),
  field_path TEXT NOT NULL CHECK (length(field_path) BETWEEN 1 AND 100),
  proposed_value TEXT CHECK (proposed_value IS NULL OR length(proposed_value) <= 1000),
  source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%' AND length(source_url) <= 500),
  source_label TEXT NOT NULL CHECK (length(source_label) BETWEEN 1 AND 200),
  checked_at TEXT NOT NULL,
  fact_kind TEXT NOT NULL CHECK (fact_kind IN ('direct', 'derived')),
  mapping_source_url TEXT CHECK (mapping_source_url IS NULL OR mapping_source_url LIKE 'https://%'),
  CHECK ((fact_kind = 'direct' AND mapping_source_url IS NULL)
    OR (fact_kind = 'derived' AND mapping_source_url IS NOT NULL)),
  UNIQUE (candidate_id, field_path, source_url)
);

CREATE INDEX population_batch_queue ON population_batches(state, reviewed_at, id);
CREATE INDEX staged_outpost_candidate_queue ON staged_outpost_candidates(state, batch_id, id);
CREATE INDEX staged_outpost_fields_candidate ON staged_outpost_fields(candidate_id, field_path);

CREATE TRIGGER population_batches_require_active_tenure
BEFORE INSERT ON population_batches
WHEN NOT EXISTS (
  SELECT 1 FROM operator_account account JOIN operator_tenures tenure
    ON tenure.tenure_number = account.active_tenure_number
  WHERE account.singleton_key = 1 AND account.state = 'active'
    AND tenure.tenure_number = new.operator_tenure_id AND tenure.ended_at IS NULL
    AND account.renewal_due_at > new.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'Population staging requires an active Operator tenure');
END;

CREATE TRIGGER directory_candidate_match_staged_fk
BEFORE INSERT ON directory_candidate_matches
WHEN new.staged_candidate_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM staged_outpost_candidates WHERE id = new.staged_candidate_id
)
BEGIN
  SELECT RAISE(ABORT, 'Staged duplicate candidate does not exist');
END;

CREATE TABLE population_candidate_apply_checks (
  candidate_id TEXT NOT NULL,
  expected_outpost_id TEXT NOT NULL,
  expected_applied_at TEXT NOT NULL
);

CREATE TRIGGER population_candidate_apply_check
BEFORE INSERT ON population_candidate_apply_checks
WHEN NOT EXISTS (
  SELECT 1 FROM staged_outpost_candidates candidate
  WHERE candidate.id = new.candidate_id AND candidate.state = 'converted-to-draft'
    AND candidate.applied_outpost_id = new.expected_outpost_id
    AND candidate.applied_at = new.expected_applied_at
)
BEGIN
  SELECT RAISE(ABORT, 'Population candidate apply conflict');
END;

CREATE TRIGGER population_candidate_apply_check_cleanup
AFTER INSERT ON population_candidate_apply_checks BEGIN
  DELETE FROM population_candidate_apply_checks WHERE rowid = new.rowid;
END;

CREATE TABLE directory_coverage_reviews (
  id TEXT PRIMARY KEY,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('jurisdiction', 'district')),
  civil_geography_id TEXT REFERENCES civil_geographies(id),
  organization_id TEXT REFERENCES organization_units(id),
  reviewed_at TEXT NOT NULL,
  review_status TEXT NOT NULL CHECK (review_status IN ('not-reviewed', 'search-in-progress', 'reviewed-with-gaps')),
  gap_note TEXT CHECK (gap_note IS NULL OR length(gap_note) BETWEEN 1 AND 1000),
  source_document_id TEXT REFERENCES source_documents(id),
  operator_tenure_id INTEGER NOT NULL REFERENCES operator_tenures(tenure_number),
  created_at TEXT NOT NULL,
  CHECK ((scope_kind = 'jurisdiction' AND civil_geography_id IS NOT NULL AND organization_id IS NULL)
    OR (scope_kind = 'district' AND organization_id IS NOT NULL AND civil_geography_id IS NULL)),
  CHECK (review_status <> 'reviewed-with-gaps' OR gap_note IS NOT NULL),
  UNIQUE (scope_kind, civil_geography_id, organization_id, reviewed_at)
);

CREATE INDEX directory_coverage_review_jurisdiction
  ON directory_coverage_reviews(civil_geography_id, reviewed_at DESC, id);
CREATE INDEX directory_coverage_review_district
  ON directory_coverage_reviews(organization_id, reviewed_at DESC, id);

CREATE VIEW public_eligible_outposts AS
SELECT directory.*
FROM public_outpost_directory directory
JOIN outpost_lifecycle lifecycle ON lifecycle.outpost_id = directory.content_id
JOIN content_records content ON content.id = directory.content_id
WHERE content.status = 'published' AND lifecycle.state IN ('verified', 'grace');

CREATE VIEW public_jurisdiction_coverage AS
SELECT geography.id civil_geography_id, geography.name, geography.code,
  COUNT(eligible.content_id) verified_listing_count
FROM civil_geographies geography
LEFT JOIN public_eligible_outposts eligible ON eligible.civil_geography_id = geography.id
WHERE geography.country_code = 'US' AND geography.geography_type IN ('state', 'district', 'territory')
GROUP BY geography.id, geography.name, geography.code;

CREATE VIEW public_region_coverage AS
SELECT region.id organization_id, region.name,
  COUNT(DISTINCT eligible.content_id) verified_listing_count
FROM organization_units region
LEFT JOIN outpost_affiliations affiliation
  ON affiliation.organization_id = region.id AND affiliation.affiliation_type = 'geographic-region'
LEFT JOIN public_eligible_outposts eligible ON eligible.content_id = affiliation.outpost_id
WHERE region.unit_type = 'region' AND region.scope = 'geographic'
GROUP BY region.id, region.name;

CREATE TRIGGER public_outpost_directory_requires_current_verification
BEFORE INSERT ON public_outpost_directory
WHEN NOT EXISTS (
  SELECT 1 FROM outpost_lifecycle lifecycle
  JOIN listing_verification_cycles cycle ON cycle.outpost_id = lifecycle.outpost_id
  JOIN listing_verification_provenance cycle_source ON cycle_source.verification_cycle_id = cycle.id
  WHERE lifecycle.outpost_id = new.content_id AND lifecycle.state IN ('verified', 'grace')
    AND cycle.cycle_number = (
      SELECT MAX(latest.cycle_number) FROM listing_verification_cycles latest
      WHERE latest.outpost_id = lifecycle.outpost_id
    )
)
BEGIN
  SELECT RAISE(ABORT, 'Published Outpost requires current core Listing Verification');
END;

CREATE TRIGGER outpost_lifecycle_remove_ineligible_public_projection
AFTER UPDATE OF state ON outpost_lifecycle
WHEN new.state IN ('verification-expired', 'archived', 'unverified')
BEGIN
  DELETE FROM public_outpost_directory WHERE content_id = new.outpost_id;
  DELETE FROM public_search_documents WHERE content_id = new.outpost_id;
END;

CREATE TRIGGER outposts_no_routine_delete
BEFORE DELETE ON outposts BEGIN
  SELECT RAISE(ABORT, 'Outpost history must be archived, not deleted');
END;

CREATE TABLE migration_0009_assertions (
  name TEXT PRIMARY KEY,
  passed INTEGER NOT NULL CHECK (passed = 1),
  checked_at TEXT NOT NULL
);

INSERT INTO migration_0009_assertions (name, passed, checked_at)
SELECT 'one lifecycle row per Outpost',
  CASE WHEN (SELECT COUNT(*) FROM outposts) = (SELECT COUNT(*) FROM outpost_lifecycle) THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0009_assertions (name, passed, checked_at)
SELECT 'public eligibility excludes expired and archived Outposts',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public_eligible_outposts eligible JOIN outpost_lifecycle lifecycle
      ON lifecycle.outpost_id = eligible.content_id
    WHERE lifecycle.state NOT IN ('verified', 'grace')
  ) THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0009_assertions (name, passed, checked_at)
SELECT 'submission PII columns are absent from public and search tables',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM sqlite_schema schema, pragma_table_info(schema.name) field
    WHERE schema.type = 'table' AND schema.name IN ('content_records', 'public_outpost_directory', 'public_search_documents')
      AND lower(field.name) IN ('reply_email', 'private_notes', 'reference_code', 'challenge_token', 'ip_address', 'user_agent')
  ) THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0009_assertions (name, passed, checked_at)
SELECT 'bare Outpost number is not globally unique',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pragma_index_list('outposts') indexes
    JOIN pragma_index_info(indexes.name) fields
    WHERE indexes.[unique] = 1 AND fields.name = 'external_number'
      AND (SELECT COUNT(*) FROM pragma_index_info(indexes.name)) = 1
  ) THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0009_assertions (name, passed, checked_at)
SELECT 'population batches and candidate keys are idempotent',
  CASE WHEN (
    SELECT COUNT(*) FROM sqlite_schema WHERE type = 'index'
      AND name IN ('sqlite_autoindex_population_batches_2', 'sqlite_autoindex_staged_outpost_candidates_2')
  ) = 2 THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0009_assertions (name, passed, checked_at)
SELECT 'submission tables are not referenced by public views',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM sqlite_schema WHERE type = 'view' AND name LIKE 'public_%'
      AND lower(COALESCE(sql, '')) LIKE '%directory_submissions%'
  ) THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0009_assertions (name, passed, checked_at)
SELECT 'U.S. directory operations have no foreign-key orphans',
  CASE WHEN NOT EXISTS (SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

PRAGMA optimize;
