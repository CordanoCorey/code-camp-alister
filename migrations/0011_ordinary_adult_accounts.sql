-- Slice 10: Better Auth credential/session tables plus private ordinary-account profiles.
-- The five auth tables below are generated from Better Auth 1.6.27's built-in
-- Kysely/D1 schema with email/password, verification, reset, sessions, and
-- database rate limiting enabled. Application-owned profile data follows them.

CREATE TABLE "user" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL,
  "image" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE TABLE "session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expiresAt" DATE NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE "account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" DATE,
  "refreshTokenExpiresAt" DATE,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE TABLE "verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" DATE NOT NULL,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE TABLE "rateLimit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "count" INTEGER NOT NULL,
  "lastRequest" BIGINT NOT NULL
);

CREATE INDEX "session_userId_idx" ON "session" ("userId");
CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");

-- Better Auth normalizes input email. This expression index also makes the
-- normalized uniqueness invariant explicit in D1.
CREATE UNIQUE INDEX user_normalized_email ON "user" (lower(trim("email")));
CREATE INDEX session_expiry ON "session" ("expiresAt", "id");

CREATE TABLE ordinary_account_eligibility_challenges (
  id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL UNIQUE CHECK (length(secret_hash) = 64),
  confirmed_at TEXT NOT NULL,
  attestation_version TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  reserved_at TEXT,
  reserved_request_id TEXT,
  consumed_at TEXT,
  consumed_auth_user_id TEXT UNIQUE REFERENCES "user" ("id") ON DELETE CASCADE,
  CHECK (expires_at > confirmed_at),
  CHECK ((reserved_at IS NULL AND reserved_request_id IS NULL)
    OR (reserved_at IS NOT NULL AND reserved_request_id IS NOT NULL)),
  CHECK ((consumed_at IS NULL AND consumed_auth_user_id IS NULL)
    OR (consumed_at IS NOT NULL AND consumed_auth_user_id IS NOT NULL))
);

CREATE INDEX ordinary_eligibility_challenge_expiry
  ON ordinary_account_eligibility_challenges (expires_at, reserved_at, id);

CREATE TABLE ordinary_account_profiles (
  auth_user_id TEXT PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  activation_state TEXT NOT NULL CHECK (activation_state IN ('pending-verification', 'active')),
  eligibility_challenge_id TEXT NOT NULL UNIQUE REFERENCES ordinary_account_eligibility_challenges(id),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 80),
  onboarding_path TEXT NOT NULL CHECK (onboarding_path IN ('usa', 'international')),
  claimed_position TEXT NOT NULL CHECK (claimed_position IN (
    'Parent/Guardian', 'Adult Leader', 'Outpost Coordinator', 'Pastor',
    'Section/Division/Area Leader', 'District Leader', 'Regional Leader',
    'National Leader', 'FCF Leader', 'Other'
  )),
  claimed_position_other TEXT CHECK (
    (claimed_position = 'Other' AND length(trim(claimed_position_other)) BETWEEN 1 AND 80)
    OR (claimed_position <> 'Other' AND claimed_position_other IS NULL)
  ),
  current_outpost_id TEXT REFERENCES outposts(content_id),
  outpost_claim TEXT CHECK (outpost_claim IS NULL OR length(trim(outpost_claim)) BETWEEN 1 AND 120),
  usa_jurisdiction_id TEXT REFERENCES civil_geographies(id),
  country_code TEXT,
  international_subdivision TEXT CHECK (
    international_subdivision IS NULL OR length(trim(international_subdivision)) BETWEEN 1 AND 100
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  activated_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK (current_outpost_id IS NULL OR outpost_claim IS NULL),
  CHECK (
    (onboarding_path = 'usa'
      AND usa_jurisdiction_id IS NOT NULL
      AND country_code IS NULL
      AND international_subdivision IS NULL)
    OR
    (onboarding_path = 'international'
      AND usa_jurisdiction_id IS NULL
      AND length(country_code) = 2
      AND country_code = upper(country_code)
      AND country_code <> 'US')
  ),
  CHECK (
    (activation_state = 'pending-verification' AND activated_at IS NULL)
    OR (activation_state = 'active' AND activated_at IS NOT NULL)
  )
);

CREATE INDEX ordinary_profiles_state ON ordinary_account_profiles (activation_state, auth_user_id);
CREATE INDEX ordinary_profiles_us_claim
  ON ordinary_account_profiles (usa_jurisdiction_id, outpost_claim, auth_user_id)
  WHERE onboarding_path = 'usa' AND current_outpost_id IS NULL;
CREATE INDEX ordinary_profiles_international_claim
  ON ordinary_account_profiles (country_code, outpost_claim, auth_user_id)
  WHERE onboarding_path = 'international' AND current_outpost_id IS NULL;

CREATE TABLE ordinary_adult_eligibility (
  auth_user_id TEXT PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  confirmed INTEGER NOT NULL CHECK (confirmed = 1),
  confirmed_at TEXT NOT NULL,
  attestation_version TEXT NOT NULL
);

CREATE TRIGGER ordinary_adult_eligibility_no_update
BEFORE UPDATE ON ordinary_adult_eligibility BEGIN
  SELECT RAISE(ABORT, 'ordinary adult eligibility is immutable');
END;

CREATE TRIGGER ordinary_adult_eligibility_no_delete
BEFORE DELETE ON ordinary_adult_eligibility BEGIN
  SELECT RAISE(ABORT, 'ordinary adult eligibility is append-only');
END;

CREATE TRIGGER ordinary_profile_version_increment
BEFORE UPDATE ON ordinary_account_profiles
WHEN new.version <> old.version + 1
BEGIN
  SELECT RAISE(ABORT, 'ordinary account profile version must increment by one');
END;

CREATE TRIGGER ordinary_profile_usa_jurisdiction
BEFORE INSERT ON ordinary_account_profiles
WHEN new.onboarding_path = 'usa' AND NOT EXISTS (
  SELECT 1 FROM civil_geographies geography
  WHERE geography.id = new.usa_jurisdiction_id
    AND geography.country_code = 'US'
    AND geography.geography_type IN ('state', 'district', 'territory')
)
BEGIN
  SELECT RAISE(ABORT, 'ordinary USA profile requires a verified USA jurisdiction');
END;

CREATE TRIGGER ordinary_profile_usa_jurisdiction_update
BEFORE UPDATE OF onboarding_path, usa_jurisdiction_id ON ordinary_account_profiles
WHEN new.onboarding_path = 'usa' AND NOT EXISTS (
  SELECT 1 FROM civil_geographies geography
  WHERE geography.id = new.usa_jurisdiction_id
    AND geography.country_code = 'US'
    AND geography.geography_type IN ('state', 'district', 'territory')
)
BEGIN
  SELECT RAISE(ABORT, 'ordinary USA profile requires a verified USA jurisdiction');
END;

CREATE TRIGGER ordinary_profile_current_outpost_scope
BEFORE INSERT ON ordinary_account_profiles
WHEN new.current_outpost_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM public_eligible_outposts eligible
  JOIN outposts outpost ON outpost.content_id = eligible.content_id
  JOIN civil_geographies geography ON geography.id = outpost.civil_geography_id
  WHERE outpost.content_id = new.current_outpost_id
    AND ((new.onboarding_path = 'usa' AND geography.id = new.usa_jurisdiction_id)
      OR (new.onboarding_path = 'international' AND geography.country_code = new.country_code))
)
BEGIN
  SELECT RAISE(ABORT, 'Current Outpost must be an explicitly selected verified listing in the chosen scope');
END;

CREATE TRIGGER ordinary_profile_current_outpost_scope_update
BEFORE UPDATE OF onboarding_path, usa_jurisdiction_id, country_code, current_outpost_id ON ordinary_account_profiles
WHEN new.current_outpost_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM public_eligible_outposts eligible
  JOIN outposts outpost ON outpost.content_id = eligible.content_id
  JOIN civil_geographies geography ON geography.id = outpost.civil_geography_id
  WHERE outpost.content_id = new.current_outpost_id
    AND ((new.onboarding_path = 'usa' AND geography.id = new.usa_jurisdiction_id)
      OR (new.onboarding_path = 'international' AND geography.country_code = new.country_code))
)
BEGIN
  SELECT RAISE(ABORT, 'Current Outpost must be an explicitly selected verified listing in the chosen scope');
END;

CREATE TRIGGER ordinary_profile_activation_requires_eligibility
BEFORE UPDATE OF activation_state ON ordinary_account_profiles
WHEN new.activation_state = 'active' AND NOT EXISTS (
  SELECT 1 FROM ordinary_adult_eligibility eligibility
  WHERE eligibility.auth_user_id = new.auth_user_id AND eligibility.confirmed = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active ordinary account requires retained adult eligibility result');
END;

-- Verification and reset links are copied here only by the explicit loopback
-- email-preview adapter. Production configuration never writes this sink.
CREATE TABLE local_auth_email_previews (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verification', 'password-reset')),
  one_time_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  CHECK (expires_at > created_at)
);

CREATE INDEX local_auth_email_preview_latest
  ON local_auth_email_previews (purpose, consumed_at, created_at DESC, id DESC);

CREATE TABLE migration_0011_assertions (
  name TEXT PRIMARY KEY,
  passed INTEGER NOT NULL CHECK (passed = 1)
);

INSERT INTO migration_0011_assertions (name, passed) VALUES
  ('better-auth-generated-core-schema', CASE WHEN (
    SELECT COUNT(*) FROM sqlite_schema
    WHERE type = 'table' AND name IN ('user', 'session', 'account', 'verification', 'rateLimit')
  ) = 5 THEN 1 ELSE 0 END),
  ('normalized-email-and-session-indexes', CASE WHEN (
    SELECT COUNT(*) FROM sqlite_schema
    WHERE type = 'index' AND name IN ('user_normalized_email', 'session_userId_idx', 'session_expiry')
  ) = 3 THEN 1 ELSE 0 END),
  ('private-profile-and-eligibility-schema', CASE WHEN (
    SELECT COUNT(*) FROM sqlite_schema
    WHERE type = 'table' AND name IN (
      'ordinary_account_eligibility_challenges', 'ordinary_account_profiles',
      'ordinary_adult_eligibility', 'local_auth_email_previews'
    )
  ) = 4 THEN 1 ELSE 0 END),
  ('zero-seeded-ordinary-accounts', CASE WHEN (SELECT COUNT(*) FROM "user") = 0 THEN 1 ELSE 0 END),
  ('birth-year-is-never-persisted', CASE WHEN
    NOT EXISTS (SELECT 1 FROM pragma_table_info('user') WHERE lower(name) LIKE '%birth%year%' OR lower(name) LIKE '%birth%date%')
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('session') WHERE lower(name) LIKE '%birth%year%' OR lower(name) LIKE '%birth%date%')
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('account') WHERE lower(name) LIKE '%birth%year%' OR lower(name) LIKE '%birth%date%')
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('verification') WHERE lower(name) LIKE '%birth%year%' OR lower(name) LIKE '%birth%date%')
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('rateLimit') WHERE lower(name) LIKE '%birth%year%' OR lower(name) LIKE '%birth%date%')
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('ordinary_account_eligibility_challenges') WHERE lower(name) LIKE '%birth%year%' OR lower(name) LIKE '%birth%date%')
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('ordinary_account_profiles') WHERE lower(name) LIKE '%birth%year%' OR lower(name) LIKE '%birth%date%')
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('ordinary_adult_eligibility') WHERE lower(name) LIKE '%birth%year%' OR lower(name) LIKE '%birth%date%')
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('local_auth_email_previews') WHERE lower(name) LIKE '%birth%year%' OR lower(name) LIKE '%birth%date%')
  THEN 1 ELSE 0 END),
  ('ordinary-data-is-absent-from-public-projections', CASE WHEN
    NOT EXISTS (SELECT 1 FROM pragma_table_info('public_advancement_directory') WHERE lower(name) IN ('email', 'auth_user_id', 'profile', 'claimed_position', 'eligibility', 'session', 'token'))
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('public_outpost_directory') WHERE lower(name) IN ('email', 'auth_user_id', 'profile', 'claimed_position', 'eligibility', 'session', 'token'))
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('public_search_documents') WHERE lower(name) IN ('email', 'auth_user_id', 'profile', 'claimed_position', 'eligibility', 'session', 'token'))
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('public_eligible_outposts') WHERE lower(name) IN ('email', 'auth_user_id', 'profile', 'claimed_position', 'eligibility', 'session', 'token'))
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('public_jurisdiction_coverage') WHERE lower(name) IN ('email', 'auth_user_id', 'profile', 'claimed_position', 'eligibility', 'session', 'token'))
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('public_region_coverage') WHERE lower(name) IN ('email', 'auth_user_id', 'profile', 'claimed_position', 'eligibility', 'session', 'token'))
  THEN 1 ELSE 0 END),
  ('operator-account-remains-isolated', CASE WHEN
    (SELECT COUNT(*) FROM operator_account) = 1
    AND NOT EXISTS (
      SELECT 1 FROM pragma_foreign_key_list('operator_account')
      WHERE "table" IN ('user', 'session', 'ordinary_account_profiles')
    )
  THEN 1 ELSE 0 END);
