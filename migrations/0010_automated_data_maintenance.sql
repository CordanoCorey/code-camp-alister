-- Slice 9: bounded automated maintenance and review-only source observations.
PRAGMA foreign_keys = ON;

CREATE TABLE maintenance_jobs (
  job_key TEXT PRIMARY KEY CHECK (job_key IN (
    'listing-lifecycle', 'proposal-retention', 'event-completion',
    'security-intent-cleanup', 'source-monitoring', 'maintenance-history-retention'
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

INSERT INTO maintenance_jobs
  (job_key, rule_version, interval_seconds, batch_size, next_due_at, created_at, updated_at)
VALUES
  ('listing-lifecycle', 'listing-lifecycle-v1', 3600, 25, '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'),
  ('proposal-retention', 'proposal-retention-v1', 3600, 25, '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'),
  ('event-completion', 'event-completion-v1', 3600, 25, '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'),
  ('security-intent-cleanup', 'security-intent-cleanup-v1', 3600, 25, '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'),
  ('source-monitoring', 'source-monitoring-v1', 1800, 16, '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z'),
  ('maintenance-history-retention', 'maintenance-history-retention-v1', 86400, 50, '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z');

CREATE INDEX maintenance_jobs_due
  ON maintenance_jobs(enabled, circuit_state, next_due_at, job_key);
CREATE INDEX maintenance_jobs_lease
  ON maintenance_jobs(lease_expires_at, job_key);
CREATE INDEX maintenance_jobs_backoff
  ON maintenance_jobs(backoff_until, next_due_at, job_key);

CREATE TABLE maintenance_runs (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('cron', 'operator-run-now', 'local-test')),
  dispatcher_rule_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  jobs_claimed INTEGER NOT NULL DEFAULT 0 CHECK (jobs_claimed >= 0),
  actions_applied INTEGER NOT NULL DEFAULT 0 CHECK (actions_applied >= 0),
  failed_tasks INTEGER NOT NULL DEFAULT 0 CHECK (failed_tasks >= 0),
  outbound_subrequests INTEGER NOT NULL DEFAULT 0 CHECK (outbound_subrequests >= 0),
  fetched_bytes INTEGER NOT NULL DEFAULT 0 CHECK (fetched_bytes >= 0),
  outcome_json TEXT CHECK (outcome_json IS NULL OR (json_valid(outcome_json) AND length(outcome_json) <= 4000)),
  operator_tenure_id INTEGER REFERENCES operator_tenures(tenure_number),
  CHECK ((trigger_type = 'operator-run-now' AND operator_tenure_id IS NOT NULL)
    OR (trigger_type <> 'operator-run-now' AND operator_tenure_id IS NULL)),
  CHECK ((status = 'running' AND completed_at IS NULL) OR (status <> 'running' AND completed_at IS NOT NULL))
);

CREATE INDEX maintenance_runs_recent ON maintenance_runs(started_at DESC, id DESC);
CREATE INDEX maintenance_runs_retention ON maintenance_runs(completed_at, status, id);

CREATE TABLE approved_source_monitors (
  source_document_id TEXT PRIMARY KEY REFERENCES source_documents(id),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  canonical_hostname TEXT NOT NULL CHECK (canonical_hostname = lower(canonical_hostname)
    AND length(canonical_hostname) BETWEEN 1 AND 253),
  source_url_fingerprint TEXT NOT NULL CHECK (length(source_url_fingerprint) = 64),
  check_mode TEXT NOT NULL CHECK (check_mode IN ('availability-metadata', 'bounded-fingerprint')),
  interval_seconds INTEGER NOT NULL CHECK (interval_seconds IN (21600, 43200, 86400, 259200, 604800)),
  maximum_response_bytes INTEGER NOT NULL CHECK (maximum_response_bytes IN (65536, 131072, 262144)),
  maximum_redirects INTEGER NOT NULL CHECK (maximum_redirects BETWEEN 0 AND 1),
  adapter_version TEXT NOT NULL DEFAULT 'review-only-v1' CHECK (adapter_version = 'review-only-v1'),
  next_due_at TEXT NOT NULL,
  last_attempt_at TEXT,
  last_success_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  backoff_until TEXT,
  circuit_state TEXT NOT NULL DEFAULT 'closed' CHECK (circuit_state IN ('closed', 'open')),
  etag_hash TEXT CHECK (etag_hash IS NULL OR length(etag_hash) = 64),
  last_modified_hash TEXT CHECK (last_modified_hash IS NULL OR length(last_modified_hash) = 64),
  etag_value TEXT CHECK (etag_value IS NULL OR length(etag_value) <= 256),
  last_modified_value TEXT CHECK (last_modified_value IS NULL OR length(last_modified_value) <= 128),
  content_fingerprint TEXT CHECK (content_fingerprint IS NULL OR length(content_fingerprint) = 64),
  redirect_fingerprint TEXT CHECK (redirect_fingerprint IS NULL OR length(redirect_fingerprint) = 64),
  lease_owner TEXT,
  lease_expires_at TEXT,
  approved_operator_tenure_id INTEGER NOT NULL REFERENCES operator_tenures(tenure_number),
  approved_at TEXT NOT NULL,
  approval_reason TEXT NOT NULL CHECK (length(approval_reason) BETWEEN 1 AND 500),
  disabled_at TEXT,
  disabled_operator_tenure_id INTEGER REFERENCES operator_tenures(tenure_number),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL)),
  CHECK ((enabled = 1 AND disabled_at IS NULL AND disabled_operator_tenure_id IS NULL)
    OR enabled = 0)
);

CREATE INDEX approved_source_monitors_due
  ON approved_source_monitors(enabled, circuit_state, next_due_at, source_document_id);
CREATE INDEX approved_source_monitors_lease
  ON approved_source_monitors(lease_expires_at, source_document_id);
CREATE INDEX approved_source_monitors_backoff
  ON approved_source_monitors(backoff_until, consecutive_failures, source_document_id);

CREATE TRIGGER approved_source_monitors_require_active_tenure
BEFORE INSERT ON approved_source_monitors
WHEN NOT EXISTS (
  SELECT 1 FROM operator_account account JOIN operator_tenures tenure
    ON tenure.tenure_number = account.active_tenure_number
  WHERE account.singleton_key = 1 AND account.state = 'active'
    AND tenure.tenure_number = new.approved_operator_tenure_id AND tenure.ended_at IS NULL
    AND account.renewal_due_at > new.approved_at
)
BEGIN
  SELECT RAISE(ABORT, 'Source monitoring approval requires an active Operator tenure');
END;

CREATE TRIGGER approved_source_monitor_reapproval_requires_active_tenure
BEFORE UPDATE OF approved_operator_tenure_id, approved_at ON approved_source_monitors
WHEN NOT EXISTS (
  SELECT 1 FROM operator_account account JOIN operator_tenures tenure
    ON tenure.tenure_number = account.active_tenure_number
  WHERE account.singleton_key = 1 AND account.state = 'active'
    AND tenure.tenure_number = new.approved_operator_tenure_id AND tenure.ended_at IS NULL
    AND account.renewal_due_at > new.approved_at
)
BEGIN
  SELECT RAISE(ABORT, 'Source monitoring reapproval requires an active Operator tenure');
END;

CREATE TABLE automated_source_observations (
  id TEXT PRIMARY KEY,
  source_document_id TEXT NOT NULL REFERENCES approved_source_monitors(source_document_id),
  maintenance_run_id TEXT NOT NULL REFERENCES maintenance_runs(id),
  observed_at TEXT NOT NULL,
  status_class TEXT NOT NULL CHECK (status_class IN ('not-modified', '2xx', '3xx', '4xx', '5xx', 'network')),
  redirect_outcome TEXT NOT NULL CHECK (redirect_outcome IN (
    'none', 'same-host', 'blocked-cross-host', 'blocked-invalid', 'redirect-limit'
  )),
  mime_family TEXT NOT NULL CHECK (mime_family IN ('none', 'html', 'text', 'pdf', 'feed', 'other')),
  bounded_byte_count INTEGER NOT NULL CHECK (bounded_byte_count BETWEEN 0 AND 262144),
  etag_hash TEXT CHECK (etag_hash IS NULL OR length(etag_hash) = 64),
  last_modified_hash TEXT CHECK (last_modified_hash IS NULL OR length(last_modified_hash) = 64),
  content_fingerprint TEXT CHECK (content_fingerprint IS NULL OR length(content_fingerprint) = 64),
  redirect_fingerprint TEXT CHECK (redirect_fingerprint IS NULL OR length(redirect_fingerprint) = 64),
  duration_bucket TEXT NOT NULL CHECK (duration_bucket IN ('under-250ms', 'under-1s', 'under-3s', 'under-10s', 'timeout')),
  error_category TEXT CHECK (error_category IS NULL OR error_category IN (
    'timeout', 'dns', 'tls', 'unauthorized', 'forbidden', 'not-found', 'rate-limited',
    'server-error', 'oversized', 'unsupported-mime', 'redirect-blocked', 'challenge', 'network'
  )),
  outcome TEXT NOT NULL CHECK (outcome IN ('baseline', 'unchanged', 'changed', 'failed')),
  retained_until TEXT NOT NULL,
  UNIQUE (maintenance_run_id, source_document_id)
);

CREATE INDEX automated_source_observations_source
  ON automated_source_observations(source_document_id, observed_at DESC, id);
CREATE INDEX automated_source_observations_retention
  ON automated_source_observations(retained_until, outcome, id);

CREATE TRIGGER automated_source_observations_no_update
BEFORE UPDATE ON automated_source_observations BEGIN
  SELECT RAISE(ABORT, 'Automated Source Observations are append-only');
END;

CREATE TABLE automated_update_candidates (
  id TEXT PRIMARY KEY,
  source_document_id TEXT NOT NULL REFERENCES source_documents(id),
  triggering_observation_id TEXT NOT NULL REFERENCES automated_source_observations(id),
  triggering_run_id TEXT NOT NULL REFERENCES maintenance_runs(id),
  current_fingerprint TEXT NOT NULL CHECK (length(current_fingerprint) = 64),
  affected_fields_json TEXT NOT NULL CHECK (json_valid(affected_fields_json) AND length(affected_fields_json) <= 16000),
  affected_field_count INTEGER NOT NULL DEFAULT 0 CHECK (affected_field_count >= 0),
  affected_fields_truncated INTEGER NOT NULL DEFAULT 0 CHECK (affected_fields_truncated IN (0, 1)),
  prior_public_values_json TEXT NOT NULL CHECK (json_valid(prior_public_values_json) AND length(prior_public_values_json) <= 32000),
  proposed_values_json TEXT CHECK (proposed_values_json IS NULL OR (json_valid(proposed_values_json) AND length(proposed_values_json) <= 16000)),
  adapter_version TEXT NOT NULL CHECK (adapter_version = 'review-only-v1'),
  state TEXT NOT NULL CHECK (state IN (
    'open', 'reviewing', 'converted-to-draft', 'no-material-change', 'superseded', 'dismissed'
  )),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_operator_tenure_id INTEGER REFERENCES operator_tenures(tenure_number),
  reviewed_at TEXT,
  review_reason TEXT CHECK (review_reason IS NULL OR length(review_reason) BETWEEN 1 AND 500),
  converted_content_id TEXT REFERENCES content_records(id),
  CHECK ((state IN ('open', 'reviewing') AND reviewed_at IS NULL AND reviewed_operator_tenure_id IS NULL)
    OR (state NOT IN ('open', 'reviewing') AND reviewed_at IS NOT NULL AND reviewed_operator_tenure_id IS NOT NULL))
);

CREATE UNIQUE INDEX automated_update_candidate_open_fingerprint
  ON automated_update_candidates(source_document_id, current_fingerprint)
  WHERE state IN ('open', 'reviewing', 'converted-to-draft');
CREATE INDEX automated_update_candidates_queue
  ON automated_update_candidates(state, created_at, id);

CREATE TABLE automated_update_candidate_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id TEXT NOT NULL REFERENCES automated_update_candidates(id),
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL CHECK (to_state IN (
    'reviewing', 'converted-to-draft', 'no-material-change', 'superseded', 'dismissed'
  )),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  operator_tenure_id INTEGER NOT NULL REFERENCES operator_tenures(tenure_number),
  created_at TEXT NOT NULL
);

CREATE INDEX automated_update_candidate_reviews_history
  ON automated_update_candidate_reviews(candidate_id, id);

CREATE TRIGGER automated_update_candidate_reviews_require_active_tenure
BEFORE INSERT ON automated_update_candidate_reviews
WHEN NOT EXISTS (
  SELECT 1 FROM operator_account account JOIN operator_tenures tenure
    ON tenure.tenure_number = account.active_tenure_number
  WHERE account.singleton_key = 1 AND account.state = 'active'
    AND tenure.tenure_number = new.operator_tenure_id AND tenure.ended_at IS NULL
    AND account.renewal_due_at > new.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'Automated Update Draft review requires an active Operator tenure');
END;

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

ALTER TABLE content_revisions ADD COLUMN automation_run_id TEXT REFERENCES maintenance_runs(id);
ALTER TABLE content_revisions ADD COLUMN automation_rule_version TEXT;
ALTER TABLE content_audit_events ADD COLUMN automation_run_id TEXT REFERENCES maintenance_runs(id);
ALTER TABLE content_audit_events ADD COLUMN automation_rule_version TEXT;

CREATE TABLE migration_0010_assertions (
  name TEXT PRIMARY KEY,
  passed INTEGER NOT NULL CHECK (passed = 1),
  checked_at TEXT NOT NULL
);

INSERT INTO migration_0010_assertions (name, passed, checked_at)
SELECT 'maintenance job keys are singleton and complete',
  CASE WHEN (SELECT COUNT(*) FROM maintenance_jobs) = 6
    AND (SELECT COUNT(DISTINCT job_key) FROM maintenance_jobs) = 6 THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0010_assertions (name, passed, checked_at)
SELECT 'approved source monitors default disabled',
  CASE WHEN (SELECT dflt_value FROM pragma_table_info('approved_source_monitors') WHERE name = 'enabled') = '0'
    AND NOT EXISTS (SELECT 1 FROM approved_source_monitors WHERE enabled <> 0)
    AND (SELECT COUNT(*) FROM sqlite_schema WHERE type = 'trigger' AND name IN (
      'approved_source_monitors_require_active_tenure',
      'approved_source_monitor_reapproval_requires_active_tenure'
    )) = 2 THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0010_assertions (name, passed, checked_at)
SELECT 'automation tables contain no fetched bodies header dumps or private intake data',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM sqlite_schema schema, pragma_table_info(schema.name) field
    WHERE schema.type = 'table'
      AND (schema.name LIKE 'maintenance_%' OR schema.name LIKE 'automation_%'
        OR schema.name LIKE 'automated_%' OR schema.name = 'approved_source_monitors'
        OR schema.name = 'system_maintenance_events')
      AND lower(field.name) IN (
        'body', 'response_body', 'response_text', 'response_headers', 'headers', 'cookies',
        'reply_email', 'private_notes', 'access_identity', 'stack_trace', 'source_url', 'redirect_url'
      )
  ) THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0010_assertions (name, passed, checked_at)
SELECT 'run and action history have durable foreign keys',
  CASE WHEN EXISTS (
      SELECT 1 FROM pragma_foreign_key_list('system_maintenance_events')
      WHERE [table] = 'maintenance_runs' AND [from] = 'maintenance_run_id'
    ) AND EXISTS (
      SELECT 1 FROM pragma_foreign_key_list('automated_source_observations')
      WHERE [table] = 'maintenance_runs' AND [from] = 'maintenance_run_id'
    ) AND EXISTS (
      SELECT 1 FROM pragma_foreign_key_list('automation_alerts')
      WHERE [table] = 'maintenance_runs' AND [from] = 'maintenance_run_id'
    ) THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0010_assertions (name, passed, checked_at)
SELECT 'system events cannot forge Operator Tenure',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pragma_table_info('system_maintenance_events')
    WHERE lower(name) LIKE '%tenure%'
  ) THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0010_assertions (name, passed, checked_at)
SELECT 'automation queues have due lease alert and retention indexes',
  CASE WHEN (SELECT COUNT(*) FROM sqlite_schema WHERE type = 'index' AND name IN (
    'maintenance_jobs_due', 'maintenance_jobs_lease', 'approved_source_monitors_due',
    'approved_source_monitors_lease', 'automation_alerts_queue',
    'automated_update_candidates_queue', 'automated_source_observations_retention'
  )) = 7 THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0010_assertions (name, passed, checked_at)
SELECT 'automated maintenance has no foreign-key orphans',
  CASE WHEN NOT EXISTS (SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

PRAGMA optimize;
