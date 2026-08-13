-- Slice 11: ordinary adult Account renewal, expiry enforcement, warning delivery,
-- and guarded irreversible deletion. Public content and the Operator lifecycle
-- remain independent.
PRAGMA defer_foreign_keys = ON;

-- Add a dedicated lifecycle job without weakening the exact maintenance-job
-- inventory introduced by migration 0010. D1 rejects dropping a referenced
-- parent even when the same table name is recreated in the migration batch,
-- so preserve and rebuild the three referencing tables (and alert reviews)
-- around the constrained parent.
CREATE TABLE automation_alerts_0012_backup AS SELECT * FROM automation_alerts;
CREATE TABLE automation_alert_reviews_0012_backup AS SELECT * FROM automation_alert_reviews;
CREATE TABLE system_maintenance_events_0012_backup AS SELECT * FROM system_maintenance_events;
CREATE TABLE maintenance_daily_aggregates_0012_backup AS SELECT * FROM maintenance_daily_aggregates;

DROP TABLE automation_alert_reviews;
DROP TABLE automation_alerts;
DROP TABLE system_maintenance_events;
DROP TABLE maintenance_daily_aggregates;

CREATE TABLE maintenance_jobs_0012 (
  job_key TEXT PRIMARY KEY CHECK (job_key IN (
    'listing-lifecycle', 'proposal-retention', 'event-completion',
    'security-intent-cleanup', 'source-monitoring', 'maintenance-history-retention',
    'ordinary-account-lifecycle'
  )),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  rule_version TEXT NOT NULL CHECK (length(rule_version) BETWEEN 1 AND 40),
  interval_seconds INTEGER NOT NULL CHECK (interval_seconds BETWEEN 300 AND 604800),
  batch_size INTEGER NOT NULL CHECK (batch_size BETWEEN 1 AND 100),
  next_due_at TEXT NOT NULL,
  last_started_at TEXT,
  last_success_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  backoff_until TEXT,
  circuit_state TEXT NOT NULL DEFAULT 'closed' CHECK (circuit_state IN ('closed', 'open')),
  lease_owner TEXT,
  lease_expires_at TEXT,
  checkpoint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL))
);

INSERT INTO maintenance_jobs_0012 SELECT * FROM maintenance_jobs;
DROP TABLE maintenance_jobs;
ALTER TABLE maintenance_jobs_0012 RENAME TO maintenance_jobs;

CREATE INDEX maintenance_jobs_due
  ON maintenance_jobs(enabled, circuit_state, next_due_at, job_key);
CREATE INDEX maintenance_jobs_lease
  ON maintenance_jobs(lease_expires_at, job_key);
CREATE INDEX maintenance_jobs_backoff
  ON maintenance_jobs(backoff_until, next_due_at, job_key);

INSERT INTO maintenance_jobs
  (job_key, enabled, rule_version, interval_seconds, batch_size, next_due_at, created_at, updated_at)
VALUES
  ('ordinary-account-lifecycle', 0, 'ordinary-account-lifecycle-v1', 3600, 25,
   '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z');

CREATE TABLE automation_alerts (
  id TEXT PRIMARY KEY,
  maintenance_run_id TEXT NOT NULL REFERENCES maintenance_runs(id),
  rule_version TEXT NOT NULL,
  actor_label TEXT NOT NULL CHECK (actor_label LIKE 'Automation: %'),
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'repeated-failure', 'scheduler-overdue', 'circuit-open', 'invariant-failure', 'backlog-threshold'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  job_key TEXT REFERENCES maintenance_jobs(job_key),
  source_document_id TEXT REFERENCES approved_source_monitors(source_document_id),
  coalescing_key TEXT NOT NULL,
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 300),
  status TEXT NOT NULL CHECK (status IN ('open', 'acknowledged', 'resolved')),
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  acknowledged_at TEXT,
  resolved_at TEXT,
  CHECK (job_key IS NOT NULL OR source_document_id IS NOT NULL)
);
INSERT INTO automation_alerts
  (id, maintenance_run_id, rule_version, actor_label, alert_type, severity,
   job_key, source_document_id, coalescing_key, summary, status,
   occurrence_count, first_seen_at, last_seen_at, acknowledged_at, resolved_at)
SELECT id, maintenance_run_id, rule_version, actor_label, alert_type, severity,
  job_key, source_document_id, coalescing_key, summary, status,
  occurrence_count, first_seen_at, last_seen_at, acknowledged_at, resolved_at
FROM automation_alerts_0012_backup;
CREATE UNIQUE INDEX automation_alerts_open_coalesced
  ON automation_alerts(coalescing_key) WHERE status IN ('open', 'acknowledged');
CREATE INDEX automation_alerts_queue ON automation_alerts(status, severity, last_seen_at DESC, id);

CREATE TABLE automation_alert_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id TEXT NOT NULL REFERENCES automation_alerts(id),
  action TEXT NOT NULL CHECK (action IN ('acknowledged', 'resolved', 'reopened')),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  operator_tenure_id INTEGER NOT NULL REFERENCES operator_tenures(tenure_number),
  created_at TEXT NOT NULL
);
INSERT INTO automation_alert_reviews SELECT * FROM automation_alert_reviews_0012_backup;
CREATE INDEX automation_alert_reviews_history ON automation_alert_reviews(alert_id, id);
CREATE TRIGGER automation_alert_reviews_require_active_tenure
BEFORE INSERT ON automation_alert_reviews
WHEN NOT EXISTS (
  SELECT 1 FROM operator_account account JOIN operator_tenures tenure
    ON tenure.tenure_number = account.active_tenure_number
  WHERE account.singleton_key = 1 AND account.state = 'active'
    AND tenure.tenure_number = new.operator_tenure_id AND tenure.ended_at IS NULL
    AND account.renewal_due_at > new.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'Automation Alert review requires an active Operator tenure');
END;

CREATE TABLE system_maintenance_events (
  id TEXT PRIMARY KEY,
  maintenance_run_id TEXT NOT NULL REFERENCES maintenance_runs(id),
  job_key TEXT NOT NULL REFERENCES maintenance_jobs(job_key),
  rule_version TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  target_type TEXT NOT NULL CHECK (target_type IN (
    'outpost', 'directory-submission', 'event', 'operator-transfer',
    'reauthentication-intent', 'source-monitor', 'maintenance-history'
  )),
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  before_state_json TEXT CHECK (before_state_json IS NULL OR (json_valid(before_state_json) AND length(before_state_json) <= 4000)),
  after_state_json TEXT CHECK (after_state_json IS NULL OR (json_valid(after_state_json) AND length(after_state_json) <= 4000)),
  actor_label TEXT NOT NULL CHECK (actor_label LIKE 'Automation: %'),
  created_at TEXT NOT NULL
);
INSERT INTO system_maintenance_events SELECT * FROM system_maintenance_events_0012_backup;
CREATE INDEX system_maintenance_events_run ON system_maintenance_events(maintenance_run_id, id);
CREATE INDEX system_maintenance_events_target ON system_maintenance_events(target_type, target_id, created_at DESC);
CREATE TRIGGER system_maintenance_events_no_update
BEFORE UPDATE ON system_maintenance_events BEGIN
  SELECT RAISE(ABORT, 'System Maintenance Events are append-only');
END;
CREATE TRIGGER system_maintenance_events_no_delete
BEFORE DELETE ON system_maintenance_events BEGIN
  SELECT RAISE(ABORT, 'System Maintenance Events are retained audit evidence');
END;

CREATE TABLE maintenance_daily_aggregates (
  aggregate_date TEXT NOT NULL,
  job_key TEXT NOT NULL REFERENCES maintenance_jobs(job_key),
  successful_runs INTEGER NOT NULL DEFAULT 0 CHECK (successful_runs >= 0),
  failed_runs INTEGER NOT NULL DEFAULT 0 CHECK (failed_runs >= 0),
  unchanged_observations INTEGER NOT NULL DEFAULT 0 CHECK (unchanged_observations >= 0),
  pruned_observations INTEGER NOT NULL DEFAULT 0 CHECK (pruned_observations >= 0),
  pruned_run_details INTEGER NOT NULL DEFAULT 0 CHECK (pruned_run_details >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (aggregate_date, job_key)
);
INSERT INTO maintenance_daily_aggregates SELECT * FROM maintenance_daily_aggregates_0012_backup;

DROP TABLE automation_alert_reviews_0012_backup;
DROP TABLE automation_alerts_0012_backup;
DROP TABLE system_maintenance_events_0012_backup;
DROP TABLE maintenance_daily_aggregates_0012_backup;

CREATE TABLE ordinary_account_lifecycles (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 16 AND 100),
  auth_user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('active', 'renewal-notice', 'expired')),
  activated_at TEXT NOT NULL,
  term_base_at TEXT NOT NULL,
  access_due_at TEXT NOT NULL,
  notice_open_at TEXT NOT NULL,
  confirmed_delivery_at TEXT,
  deletion_due_at TEXT,
  last_renewed_at TEXT,
  expired_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (term_base_at >= activated_at),
  CHECK (access_due_at > term_base_at),
  CHECK (notice_open_at < access_due_at),
  CHECK ((confirmed_delivery_at IS NULL) = (deletion_due_at IS NULL)),
  CHECK (deletion_due_at IS NULL OR deletion_due_at > confirmed_delivery_at),
  CHECK (state <> 'expired' OR expired_at IS NOT NULL)
);

CREATE INDEX ordinary_lifecycle_notice_due
  ON ordinary_account_lifecycles(state, notice_open_at, access_due_at, id)
  WHERE state = 'active';
CREATE INDEX ordinary_lifecycle_expiration_due
  ON ordinary_account_lifecycles(state, access_due_at, id)
  WHERE state IN ('active', 'renewal-notice');
CREATE INDEX ordinary_lifecycle_deletion_due
  ON ordinary_account_lifecycles(state, deletion_due_at, id)
  WHERE state = 'expired' AND deletion_due_at IS NOT NULL;
CREATE INDEX ordinary_lifecycle_user_enforcement
  ON ordinary_account_lifecycles(auth_user_id, state, access_due_at, version);

CREATE TRIGGER ordinary_lifecycle_version_increment
BEFORE UPDATE ON ordinary_account_lifecycles
WHEN new.version <> old.version + 1
BEGIN
  SELECT RAISE(ABORT, 'ordinary Account lifecycle version must increment by one');
END;

CREATE TABLE ordinary_account_renewal_events (
  id TEXT PRIMARY KEY,
  lifecycle_id TEXT NOT NULL REFERENCES ordinary_account_lifecycles(id) ON DELETE CASCADE,
  prior_due_at TEXT NOT NULL,
  renewed_at TEXT NOT NULL,
  new_due_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 16 AND 160),
  version_before INTEGER NOT NULL CHECK (version_before >= 1),
  version_after INTEGER NOT NULL CHECK (version_after = version_before + 1),
  CHECK (renewed_at < prior_due_at),
  CHECK (new_due_at > prior_due_at)
);

CREATE UNIQUE INDEX ordinary_renewal_once_per_prior_due
  ON ordinary_account_renewal_events(lifecycle_id, prior_due_at);

CREATE TABLE ordinary_account_notice_deliveries (
  id TEXT PRIMARY KEY,
  lifecycle_id TEXT NOT NULL REFERENCES ordinary_account_lifecycles(id) ON DELETE CASCADE,
  term_due_at TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number BETWEEN 1 AND 5),
  state TEXT NOT NULL CHECK (state IN (
    'queued', 'sending', 'retry', 'accepted', 'permanent-failure', 'cancelled'
  )),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 16 AND 160),
  provider_request_fingerprint TEXT CHECK (
    provider_request_fingerprint IS NULL OR length(provider_request_fingerprint) = 64
  ),
  outcome_category TEXT CHECK (
    outcome_category IS NULL OR outcome_category IN ('accepted', 'transient', 'rejected', 'timeout', 'cancelled')
  ),
  attempted_at TEXT,
  accepted_at TEXT,
  next_attempt_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (lifecycle_id, term_due_at, attempt_number),
  CHECK (state <> 'accepted' OR (accepted_at IS NOT NULL AND outcome_category = 'accepted'))
);

CREATE INDEX ordinary_notice_delivery_due
  ON ordinary_account_notice_deliveries(state, next_attempt_at, term_due_at, lifecycle_id, attempt_number)
  WHERE state IN ('queued', 'retry');
CREATE UNIQUE INDEX ordinary_notice_one_acceptance_per_term
  ON ordinary_account_notice_deliveries(lifecycle_id, term_due_at)
  WHERE state = 'accepted';

CREATE TABLE ordinary_account_lifecycle_events (
  id TEXT PRIMARY KEY,
  lifecycle_id TEXT NOT NULL REFERENCES ordinary_account_lifecycles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'activated', 'notice-opened', 'notice-accepted', 'renewed', 'expired', 'sessions-revoked'
  )),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 16 AND 160),
  event_at TEXT NOT NULL,
  prior_state TEXT,
  resulting_state TEXT NOT NULL,
  due_at TEXT NOT NULL,
  actor_label TEXT NOT NULL CHECK (actor_label IN ('Account holder', 'Automation: ordinary-account-lifecycle-v1')),
  CHECK (prior_state IS NULL OR prior_state IN ('active', 'renewal-notice', 'expired')),
  CHECK (resulting_state IN ('active', 'renewal-notice', 'expired'))
);

CREATE INDEX ordinary_lifecycle_events_time
  ON ordinary_account_lifecycle_events(lifecycle_id, event_at, id);

-- A guard is deliberately short-lived and application-owned. It has no user
-- foreign key so it survives long enough for the guarded user cascade, then the
-- same atomic batch must remove it.
CREATE TABLE ordinary_account_deletion_guards (
  auth_user_id TEXT PRIMARY KEY,
  lifecycle_id TEXT NOT NULL UNIQUE,
  expected_version INTEGER NOT NULL CHECK (expected_version >= 1),
  maintenance_run_id TEXT NOT NULL REFERENCES maintenance_runs(id),
  action TEXT NOT NULL CHECK (action = 'ordinary-account-lifecycle-deletion-v1'),
  created_at TEXT NOT NULL
);

DROP TRIGGER ordinary_adult_eligibility_no_delete;
CREATE TRIGGER ordinary_adult_eligibility_no_delete
BEFORE DELETE ON ordinary_adult_eligibility
WHEN NOT EXISTS (
  SELECT 1 FROM ordinary_account_deletion_guards guard
  WHERE guard.auth_user_id = old.auth_user_id
)
BEGIN
  SELECT RAISE(ABORT, 'ordinary adult eligibility is append-only outside guarded lifecycle deletion');
END;

CREATE TRIGGER ordinary_account_user_delete_guard
BEFORE DELETE ON "user"
WHEN EXISTS (
  SELECT 1 FROM ordinary_account_profiles profile WHERE profile.auth_user_id = old.id
) AND NOT EXISTS (
  SELECT 1 FROM ordinary_account_deletion_guards guard
  JOIN ordinary_account_lifecycles lifecycle ON lifecycle.id = guard.lifecycle_id
  WHERE guard.auth_user_id = old.id
    AND lifecycle.auth_user_id = old.id
    AND lifecycle.state = 'expired'
    AND lifecycle.deletion_due_at IS NOT NULL
    AND lifecycle.version = guard.expected_version
)
BEGIN
  SELECT RAISE(ABORT, 'ordinary Account deletion requires the guarded lifecycle transition');
END;

-- Better Auth hooks supply a clear auth error, while these triggers close the
-- D1 check/insert race at the persistence boundary.
CREATE TRIGGER ordinary_session_lifecycle_guard
BEFORE INSERT ON "session"
WHEN EXISTS (
  SELECT 1 FROM ordinary_account_profiles profile
  WHERE profile.auth_user_id = new."userId" AND profile.activation_state = 'active'
) AND NOT EXISTS (
  SELECT 1 FROM ordinary_account_lifecycles lifecycle
  WHERE lifecycle.auth_user_id = new."userId"
    AND lifecycle.access_due_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
BEGIN
  SELECT RAISE(ABORT, 'ordinary Account access expired');
END;

CREATE TRIGGER ordinary_session_refresh_lifecycle_guard
BEFORE UPDATE OF "expiresAt" ON "session"
WHEN EXISTS (
  SELECT 1 FROM ordinary_account_profiles profile
  WHERE profile.auth_user_id = new."userId" AND profile.activation_state = 'active'
) AND NOT EXISTS (
  SELECT 1 FROM ordinary_account_lifecycles lifecycle
  WHERE lifecycle.auth_user_id = new."userId"
    AND lifecycle.access_due_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
BEGIN
  SELECT RAISE(ABORT, 'ordinary Account access expired');
END;

-- In this pinned Better Auth configuration every persisted verification value
-- is a password-reset user id. Requiring that user to still exist prevents a
-- request that began before deletion from inserting orphan reset material
-- after the guarded batch completes. Active ordinary Accounts must also remain
-- inside their access term before reset material or a new password is written.
CREATE TRIGGER ordinary_verification_lifecycle_guard
BEFORE INSERT ON verification
WHEN NOT EXISTS (SELECT 1 FROM "user" auth_user WHERE auth_user.id = new.value)
  OR EXISTS (
    SELECT 1 FROM ordinary_account_profiles profile
    WHERE profile.auth_user_id = new.value AND profile.activation_state = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM ordinary_account_lifecycles lifecycle
        WHERE lifecycle.auth_user_id = profile.auth_user_id
          AND lifecycle.access_due_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'ordinary Account password recovery is unavailable');
END;

CREATE TRIGGER ordinary_credential_update_lifecycle_guard
BEFORE UPDATE OF password ON "account"
WHEN EXISTS (
  SELECT 1 FROM ordinary_account_profiles profile
  WHERE profile.auth_user_id = new."userId" AND profile.activation_state = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM ordinary_account_lifecycles lifecycle
      WHERE lifecycle.auth_user_id = profile.auth_user_id
        AND lifecycle.access_due_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
)
BEGIN
  SELECT RAISE(ABORT, 'ordinary Account password recovery is unavailable');
END;

CREATE TRIGGER ordinary_credential_insert_lifecycle_guard
BEFORE INSERT ON "account"
WHEN EXISTS (
  SELECT 1 FROM ordinary_account_profiles profile
  WHERE profile.auth_user_id = new."userId" AND profile.activation_state = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM ordinary_account_lifecycles lifecycle
      WHERE lifecycle.auth_user_id = profile.auth_user_id
        AND lifecycle.access_due_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    )
)
BEGIN
  SELECT RAISE(ABORT, 'ordinary Account password recovery is unavailable');
END;

-- Local warning previews remain loopback-only but use the same explicit sink as
-- verification and recovery. Rebuilding broadens only the purpose enum.
CREATE TABLE local_auth_email_previews_0012 (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verification', 'password-reset', 'renewal-warning')),
  one_time_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  CHECK (expires_at > created_at)
);

INSERT INTO local_auth_email_previews_0012 SELECT * FROM local_auth_email_previews;
DROP TABLE local_auth_email_previews;
ALTER TABLE local_auth_email_previews_0012 RENAME TO local_auth_email_previews;
CREATE INDEX local_auth_email_preview_latest
  ON local_auth_email_previews(purpose, consumed_at, created_at DESC, id DESC);

-- Deterministic backfill uses each already-active profile's activation instant,
-- never migration-application time. February 29 clamps to February 28.
WITH lifecycle_source AS (
  SELECT profile.auth_user_id, profile.activated_at,
    CASE WHEN substr(profile.activated_at, 6, 5) = '02-29'
      THEN printf('%04d-02-28%s', CAST(substr(profile.activated_at, 1, 4) AS INTEGER) + 1,
        substr(profile.activated_at, 11))
      ELSE printf('%04d%s', CAST(substr(profile.activated_at, 1, 4) AS INTEGER) + 1,
        substr(profile.activated_at, 5))
    END access_due_at
  FROM ordinary_account_profiles profile
  WHERE profile.activation_state = 'active' AND profile.activated_at IS NOT NULL
), lifecycle_schedule AS (
  SELECT auth_user_id, activated_at, access_due_at,
    strftime('%Y-%m-', access_due_at, 'start of month', '-1 month')
      || printf('%02d', min(
        CAST(substr(access_due_at, 9, 2) AS INTEGER),
        CAST(strftime('%d', access_due_at, 'start of month', '-1 day') AS INTEGER)
      )) || substr(access_due_at, 11) notice_open_at
  FROM lifecycle_source
)
INSERT INTO ordinary_account_lifecycles
  (id, auth_user_id, state, activated_at, term_base_at, access_due_at, notice_open_at,
   version, created_at, updated_at)
SELECT 'ordinary-lifecycle-' || auth_user_id, auth_user_id, 'active', activated_at,
  activated_at, access_due_at, notice_open_at, 1, activated_at, activated_at
FROM lifecycle_schedule;

INSERT INTO ordinary_account_lifecycle_events
  (id, lifecycle_id, event_type, idempotency_key, event_at, prior_state,
   resulting_state, due_at, actor_label)
SELECT 'ordinary-activation-' || lifecycle.id, lifecycle.id, 'activated',
  'ordinary-account-lifecycle-v1:activated:' || lifecycle.id,
  lifecycle.activated_at, NULL, 'active', lifecycle.access_due_at,
  'Automation: ordinary-account-lifecycle-v1'
FROM ordinary_account_lifecycles lifecycle;

CREATE TABLE migration_0012_assertions (
  name TEXT PRIMARY KEY,
  passed INTEGER NOT NULL CHECK (passed = 1)
);

INSERT INTO migration_0012_assertions (name, passed) VALUES
  ('ordinary-lifecycle-policy-shape', CASE WHEN
    (SELECT COUNT(*) FROM sqlite_schema WHERE type = 'table' AND name IN (
      'ordinary_account_lifecycles', 'ordinary_account_renewal_events',
      'ordinary_account_notice_deliveries', 'ordinary_account_lifecycle_events',
      'ordinary_account_deletion_guards'
    )) = 5
    AND (SELECT COUNT(*) FROM maintenance_jobs
      WHERE job_key = 'ordinary-account-lifecycle' AND enabled = 0) = 1
    AND NOT EXISTS (SELECT 1 FROM maintenance_jobs WHERE enabled <> 0)
    AND (SELECT COUNT(*) FROM sqlite_schema WHERE type = 'trigger' AND name IN (
      'ordinary_session_lifecycle_guard', 'ordinary_session_refresh_lifecycle_guard',
      'ordinary_verification_lifecycle_guard', 'ordinary_credential_update_lifecycle_guard',
      'ordinary_credential_insert_lifecycle_guard'
    )) = 5
  THEN 1 ELSE 0 END),
  ('deterministic-complete-lifecycle-backfill', CASE WHEN
    (SELECT COUNT(*) FROM ordinary_account_lifecycles)
      = (SELECT COUNT(*) FROM ordinary_account_profiles WHERE activation_state = 'active')
    AND NOT EXISTS (
      SELECT 1 FROM ordinary_account_profiles profile
      LEFT JOIN ordinary_account_lifecycles lifecycle ON lifecycle.auth_user_id = profile.auth_user_id
      WHERE profile.activation_state = 'active' AND lifecycle.id IS NULL
    )
  THEN 1 ELSE 0 END),
  ('zero-seeded-ordinary-accounts', CASE WHEN
    NOT EXISTS (
      SELECT 1 FROM "user" auth_user
      LEFT JOIN ordinary_account_profiles profile ON profile.auth_user_id = auth_user.id
      WHERE profile.auth_user_id IS NULL
    )
  THEN 1 ELSE 0 END),
  ('birth-year-is-never-persisted-through-lifecycle', CASE WHEN
    NOT EXISTS (SELECT 1 FROM pragma_table_info('ordinary_account_lifecycles')
      WHERE lower(name) LIKE '%birth%year%' OR lower(name) LIKE '%birth%date%')
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('ordinary_account_renewal_events')
      WHERE lower(name) LIKE '%birth%year%' OR lower(name) LIKE '%birth%date%')
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('ordinary_account_notice_deliveries')
      WHERE lower(name) LIKE '%birth%year%' OR lower(name) LIKE '%birth%date%')
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('ordinary_account_lifecycle_events')
      WHERE lower(name) LIKE '%birth%year%' OR lower(name) LIKE '%birth%date%')
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('ordinary_account_deletion_guards')
      WHERE lower(name) LIKE '%birth%year%' OR lower(name) LIKE '%birth%date%')
  THEN 1 ELSE 0 END),
  ('public-and-operator-data-remain-isolated', CASE WHEN
    NOT EXISTS (SELECT 1 FROM pragma_table_info('public_advancement_directory')
      WHERE lower(name) IN ('auth_user_id', 'lifecycle_id', 'access_due_at', 'deletion_due_at', 'email', 'session'))
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('public_outpost_directory')
      WHERE lower(name) IN ('auth_user_id', 'lifecycle_id', 'access_due_at', 'deletion_due_at', 'email', 'session'))
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('public_search_documents')
      WHERE lower(name) IN ('auth_user_id', 'lifecycle_id', 'access_due_at', 'deletion_due_at', 'email', 'session'))
    AND NOT EXISTS (SELECT 1 FROM pragma_table_info('public_eligible_outposts')
      WHERE lower(name) IN ('auth_user_id', 'lifecycle_id', 'access_due_at', 'deletion_due_at', 'email', 'session'))
    AND NOT EXISTS (
      SELECT 1 FROM pragma_foreign_key_list('operator_account')
      WHERE "table" IN ('user', 'ordinary_account_lifecycles')
    )
  THEN 1 ELSE 0 END),
  ('complete-auth-profile-cascade-shape', CASE WHEN
    (SELECT COUNT(*) FROM pragma_foreign_key_list('session')
      WHERE "table" = 'user' AND "from" = 'userId' AND on_delete = 'CASCADE') = 1
    AND (SELECT COUNT(*) FROM pragma_foreign_key_list('account')
      WHERE "table" = 'user' AND "from" = 'userId' AND on_delete = 'CASCADE') = 1
    AND (SELECT COUNT(*) FROM pragma_foreign_key_list('ordinary_account_profiles')
      WHERE "table" = 'user' AND "from" = 'auth_user_id' AND on_delete = 'CASCADE') = 1
    AND (SELECT COUNT(*) FROM pragma_foreign_key_list('ordinary_adult_eligibility')
      WHERE "table" = 'user' AND "from" = 'auth_user_id' AND on_delete = 'CASCADE') = 1
    AND (SELECT COUNT(*) FROM pragma_foreign_key_list('ordinary_account_lifecycles')
      WHERE "table" = 'user' AND "from" = 'auth_user_id' AND on_delete = 'CASCADE') = 1
  THEN 1 ELSE 0 END),
  ('lifecycle-due-and-enforcement-indexes', CASE WHEN
    (SELECT COUNT(*) FROM sqlite_schema WHERE type = 'index' AND name IN (
      'ordinary_lifecycle_notice_due', 'ordinary_lifecycle_expiration_due',
      'ordinary_lifecycle_deletion_due', 'ordinary_lifecycle_user_enforcement',
      'ordinary_notice_delivery_due', 'session_userId_idx'
    )) = 6
    AND (SELECT COUNT(*) FROM sqlite_schema WHERE type = 'trigger' AND name IN (
      'ordinary_session_lifecycle_guard', 'ordinary_session_refresh_lifecycle_guard',
      'ordinary_account_user_delete_guard'
    )) = 3
  THEN 1 ELSE 0 END);
