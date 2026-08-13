-- Slice 15: private international candidate review.
-- Country, National Program, coverage, and local-unit facts remain private until
-- an Operator converts a reviewed candidate to a canonical draft.

CREATE TABLE international_population_batches (
  id TEXT PRIMARY KEY,
  batch_key TEXT NOT NULL UNIQUE,
  source_register TEXT NOT NULL,
  manifest_checksum TEXT NOT NULL UNIQUE CHECK (length(manifest_checksum) = 64),
  reviewed_at TEXT NOT NULL,
  country_code TEXT NOT NULL CHECK (length(country_code) = 2 AND country_code = upper(country_code)),
  coverage_state TEXT NOT NULL CHECK (coverage_state IN (
    'program-not-verified', 'country-information-directory-incomplete',
    'accepting-verified-submissions', 'verified-directory-maintained-by-local-editors'
  )),
  candidate_count INTEGER NOT NULL CHECK (candidate_count BETWEEN 1 AND 4),
  state TEXT NOT NULL DEFAULT 'staged' CHECK (state IN ('staged', 'partially-applied', 'applied', 'rejected')),
  operator_tenure_id INTEGER NOT NULL REFERENCES operator_tenures(tenure_number),
  created_at TEXT NOT NULL
);

CREATE TABLE staged_international_candidates (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES international_population_batches(id),
  stable_candidate_key TEXT NOT NULL UNIQUE,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  national_program_id TEXT NOT NULL,
  national_program_name TEXT NOT NULL,
  rri_grouping TEXT,
  local_unit_label TEXT NOT NULL,
  identifier_raw TEXT,
  display_name_raw TEXT,
  church TEXT,
  subdivision_label TEXT,
  subdivision_name TEXT,
  city TEXT,
  street_address TEXT,
  public_contact_url TEXT,
  affiliations_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(affiliations_json)),
  fcf_availability TEXT NOT NULL CHECK (fcf_availability IN ('available', 'not-offered', 'not-verified')),
  active_fcf TEXT NOT NULL CHECK (active_fcf IN ('yes', 'no', 'not-verified')),
  state TEXT NOT NULL DEFAULT 'staged' CHECK (state IN ('staged', 'duplicate-review', 'converted-to-draft', 'rejected')),
  created_at TEXT NOT NULL,
  applied_at TEXT,
  applied_outpost_id TEXT REFERENCES outposts(content_id),
  CHECK ((state = 'converted-to-draft' AND applied_at IS NOT NULL AND applied_outpost_id IS NOT NULL)
    OR (state <> 'converted-to-draft' AND applied_at IS NULL AND applied_outpost_id IS NULL))
);

CREATE TABLE staged_international_fields (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES staged_international_candidates(id),
  field_path TEXT NOT NULL,
  proposed_value TEXT,
  source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
  source_label TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  UNIQUE(candidate_id, field_path, source_url)
);

CREATE TABLE staged_international_matches (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES staged_international_candidates(id),
  outpost_id TEXT NOT NULL REFERENCES outposts(content_id),
  match_kind TEXT NOT NULL CHECK (match_kind IN ('scoped-identifier', 'church-location', 'source-url')),
  evidence_summary TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'candidate' CHECK (state IN ('candidate', 'confirmed-duplicate', 'dismissed')),
  resolved_at TEXT,
  operator_tenure_id INTEGER REFERENCES operator_tenures(tenure_number),
  UNIQUE(candidate_id, outpost_id, match_kind)
);

CREATE TABLE international_coverage_reviews (
  country_code TEXT PRIMARY KEY REFERENCES countries(code),
  coverage_state TEXT NOT NULL,
  named_local_editors TEXT,
  reviewed_at TEXT NOT NULL,
  source_register TEXT NOT NULL,
  operator_tenure_id INTEGER NOT NULL REFERENCES operator_tenures(tenure_number),
  CHECK (coverage_state <> 'verified-directory-maintained-by-local-editors' OR named_local_editors IS NOT NULL)
);

CREATE INDEX staged_international_queue ON staged_international_candidates(state, country_code, created_at, id);
CREATE INDEX staged_international_identity ON staged_international_candidates(country_code, national_program_id, identifier_raw);
CREATE INDEX staged_international_fields_candidate ON staged_international_fields(candidate_id, field_path);

CREATE TRIGGER international_batches_require_active_tenure
BEFORE INSERT ON international_population_batches
WHEN NOT EXISTS (
  SELECT 1 FROM operator_account account JOIN operator_tenures tenure
    ON tenure.tenure_number = account.active_tenure_number
  WHERE account.singleton_key = 1 AND account.state = 'active'
    AND tenure.tenure_number = new.operator_tenure_id AND tenure.ended_at IS NULL
    AND account.renewal_due_at > new.created_at
)
BEGIN SELECT RAISE(ABORT, 'International population staging requires an active Operator tenure'); END;

CREATE TABLE migration_0014_assertions (name TEXT PRIMARY KEY, passed INTEGER NOT NULL CHECK (passed = 1));
INSERT INTO migration_0014_assertions VALUES
  ('private-country-program-candidates', CASE WHEN EXISTS (SELECT 1 FROM sqlite_schema WHERE name = 'staged_international_candidates') THEN 1 ELSE 0 END),
  ('review-only-coverage', CASE WHEN EXISTS (SELECT 1 FROM sqlite_schema WHERE name = 'international_coverage_reviews') THEN 1 ELSE 0 END),
  ('no-foreign-key-orphans', CASE WHEN NOT EXISTS (SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE 0 END);

PRAGMA optimize;
