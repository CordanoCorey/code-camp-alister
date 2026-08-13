PRAGMA defer_foreign_keys = ON;

-- Numbered tenures keep responsibility history without retaining personal identity.
CREATE TABLE operator_tenures (
  tenure_number INTEGER PRIMARY KEY CHECK (tenure_number >= 1),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  ending_event TEXT CHECK (ending_event IS NULL OR ending_event = 'accepted-transfer'),
  CHECK ((ended_at IS NULL) = (ending_event IS NULL))
);

CREATE UNIQUE INDEX operator_one_open_tenure
  ON operator_tenures((1)) WHERE ended_at IS NULL;

-- An ephemeral guard makes the accepted-transfer batch the only path that may
-- close the sole active tenure. It is created from token-bound pending state
-- and removed only after the successor transition is complete.
CREATE TABLE operator_acceptance_guards (
  request_id TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL,
  predecessor_tenure_number INTEGER NOT NULL,
  successor_email TEXT NOT NULL,
  token_hash TEXT NOT NULL CHECK (length(token_hash) = 64),
  accepted_at TEXT NOT NULL
);

CREATE TRIGGER operator_tenures_restrict_update
BEFORE UPDATE ON operator_tenures
WHEN NOT (
  old.ended_at IS NULL AND new.ended_at IS NOT NULL
  AND new.ending_event = 'accepted-transfer'
  AND new.tenure_number IS old.tenure_number
  AND new.started_at IS old.started_at
  AND EXISTS (
    SELECT 1 FROM operator_acceptance_guards guard
    JOIN operator_transfers transfer ON transfer.id = guard.transfer_id
    JOIN operator_account account
      ON account.active_tenure_number = guard.predecessor_tenure_number
    WHERE guard.predecessor_tenure_number = old.tenure_number
      AND guard.accepted_at = new.ended_at
      AND transfer.state = 'pending'
      AND transfer.predecessor_tenure_number = old.tenure_number
      AND transfer.successor_email = guard.successor_email
      AND transfer.acceptance_token_hash = guard.token_hash
      AND transfer.expires_at > guard.accepted_at
  )
)
BEGIN
  SELECT RAISE(ABORT, 'operator tenure history is immutable');
END;

CREATE TRIGGER operator_tenures_no_delete
BEFORE DELETE ON operator_tenures BEGIN
  SELECT RAISE(ABORT, 'operator tenure history is append-only');
END;

CREATE TABLE operator_adult_eligibility (
  tenure_number INTEGER PRIMARY KEY REFERENCES operator_tenures(tenure_number),
  confirmed INTEGER NOT NULL CHECK (confirmed = 1),
  confirmed_at TEXT NOT NULL,
  attestation_version TEXT NOT NULL
);

CREATE TRIGGER operator_adult_eligibility_no_update
BEFORE UPDATE ON operator_adult_eligibility BEGIN
  SELECT RAISE(ABORT, 'adult eligibility is immutable');
END;
CREATE TRIGGER operator_adult_eligibility_no_delete
BEFORE DELETE ON operator_adult_eligibility BEGIN
  SELECT RAISE(ABORT, 'adult eligibility is append-only');
END;

-- This fixed row is the only Operator Account. It intentionally starts without PII.
CREATE TABLE operator_account (
  singleton_key INTEGER PRIMARY KEY CHECK (singleton_key = 1),
  state TEXT NOT NULL CHECK (state IN ('unclaimed', 'active')),
  display_name TEXT,
  verified_email TEXT COLLATE NOCASE,
  current_outpost_id TEXT REFERENCES outposts(content_id),
  active_tenure_number INTEGER REFERENCES operator_tenures(tenure_number),
  eligibility_confirmed INTEGER CHECK (eligibility_confirmed IS NULL OR eligibility_confirmed = 1),
  eligibility_confirmed_at TEXT,
  attestation_version TEXT,
  activated_at TEXT,
  renewal_due_at TEXT,
  access_cleanup_required INTEGER NOT NULL DEFAULT 0 CHECK (access_cleanup_required IN (0, 1)),
  access_cleanup_confirmed_at TEXT,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  CHECK (
    (state = 'unclaimed'
      AND display_name IS NULL AND verified_email IS NULL AND current_outpost_id IS NULL
      AND active_tenure_number IS NULL AND eligibility_confirmed IS NULL
      AND eligibility_confirmed_at IS NULL AND attestation_version IS NULL
      AND activated_at IS NULL AND renewal_due_at IS NULL AND version = 0)
    OR
    (state = 'active'
      AND length(trim(display_name)) BETWEEN 1 AND 80
      AND verified_email = lower(trim(verified_email))
      AND instr(verified_email, '@') > 1
      AND active_tenure_number IS NOT NULL AND eligibility_confirmed = 1
      AND eligibility_confirmed_at IS NOT NULL AND attestation_version IS NOT NULL
      AND activated_at IS NOT NULL AND renewal_due_at IS NOT NULL AND version >= 1)
  )
);

INSERT INTO operator_account (singleton_key, state) VALUES (1, 'unclaimed');

CREATE TRIGGER operator_account_no_insert
BEFORE INSERT ON operator_account BEGIN
  SELECT RAISE(ABORT, 'only one Operator Account may exist');
END;
CREATE TRIGGER operator_account_no_delete
BEFORE DELETE ON operator_account BEGIN
  SELECT RAISE(ABORT, 'the Operator Account cannot be deleted');
END;
CREATE TRIGGER operator_account_fixed_key
BEFORE UPDATE OF singleton_key ON operator_account BEGIN
  SELECT RAISE(ABORT, 'the Operator Account key is fixed');
END;
CREATE TRIGGER operator_account_version_increment
BEFORE UPDATE ON operator_account
WHEN new.version <> old.version + 1
BEGIN
  SELECT RAISE(ABORT, 'the Operator Account version must increment by one');
END;
CREATE TRIGGER operator_account_active_tenure
BEFORE UPDATE ON operator_account
WHEN new.state = 'active' AND NOT EXISTS (
  SELECT 1 FROM operator_tenures tenure
  WHERE tenure.tenure_number = new.active_tenure_number AND tenure.ended_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'the active Operator tenure is invalid');
END;

CREATE TABLE operator_renewal_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenure_number INTEGER NOT NULL REFERENCES operator_tenures(tenure_number),
  prior_due_at TEXT NOT NULL,
  new_due_at TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  actor_tenure_number INTEGER NOT NULL REFERENCES operator_tenures(tenure_number),
  request_id TEXT NOT NULL UNIQUE,
  UNIQUE (tenure_number, prior_due_at)
);

CREATE TRIGGER operator_renewal_events_no_update
BEFORE UPDATE ON operator_renewal_events BEGIN
  SELECT RAISE(ABORT, 'renewal history is append-only');
END;
CREATE TRIGGER operator_renewal_events_no_delete
BEFORE DELETE ON operator_renewal_events BEGIN
  SELECT RAISE(ABORT, 'renewal history is append-only');
END;

CREATE TABLE operator_renewal_notices (
  tenure_number INTEGER NOT NULL REFERENCES operator_tenures(tenure_number),
  due_at TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  first_recorded_at TEXT NOT NULL,
  acknowledged_at TEXT,
  PRIMARY KEY (tenure_number, due_at)
);

CREATE TRIGGER operator_renewal_notices_restrict_update
BEFORE UPDATE ON operator_renewal_notices
WHEN NOT (
  old.acknowledged_at IS NULL AND new.acknowledged_at IS NOT NULL
  AND new.tenure_number IS old.tenure_number AND new.due_at IS old.due_at
  AND new.opened_at IS old.opened_at AND new.first_recorded_at IS old.first_recorded_at
)
BEGIN
  SELECT RAISE(ABORT, 'renewal notice history is immutable');
END;
CREATE TRIGGER operator_renewal_notices_no_delete
BEFORE DELETE ON operator_renewal_notices BEGIN
  SELECT RAISE(ABORT, 'renewal notice history is append-only');
END;

CREATE TABLE operator_reauthentication_intents (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  tenure_number INTEGER NOT NULL REFERENCES operator_tenures(tenure_number),
  intended_action TEXT NOT NULL CHECK (intended_action IN ('renew', 'transfer', 'settings')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX operator_reauthentication_active
  ON operator_reauthentication_intents(tenure_number, intended_action, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE operator_transfers (
  id TEXT PRIMARY KEY,
  predecessor_tenure_number INTEGER NOT NULL REFERENCES operator_tenures(tenure_number),
  initiation_kind TEXT NOT NULL CHECK (initiation_kind IN ('operator', 'recovery')),
  successor_display_name TEXT,
  successor_email TEXT COLLATE NOCASE,
  successor_current_outpost_id TEXT REFERENCES outposts(content_id),
  acceptance_token_hash TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'cancelled', 'expired', 'accepted')),
  cancelled_at TEXT,
  expired_at TEXT,
  accepted_at TEXT,
  successor_tenure_number INTEGER REFERENCES operator_tenures(tenure_number),
  request_id TEXT NOT NULL UNIQUE,
  CHECK (
    (state = 'pending'
      AND length(trim(successor_display_name)) BETWEEN 1 AND 80
      AND successor_email = lower(trim(successor_email)) AND instr(successor_email, '@') > 1
      AND length(acceptance_token_hash) = 64
      AND cancelled_at IS NULL AND expired_at IS NULL AND accepted_at IS NULL
      AND successor_tenure_number IS NULL)
    OR
    (state <> 'pending'
      AND successor_display_name IS NULL AND successor_email IS NULL
      AND successor_current_outpost_id IS NULL AND acceptance_token_hash IS NULL
      AND ((state = 'cancelled' AND cancelled_at IS NOT NULL AND expired_at IS NULL AND accepted_at IS NULL)
        OR (state = 'expired' AND expired_at IS NOT NULL AND cancelled_at IS NULL AND accepted_at IS NULL)
        OR (state = 'accepted' AND accepted_at IS NOT NULL AND cancelled_at IS NULL AND expired_at IS NULL
          AND successor_tenure_number IS NOT NULL)))
  )
);

CREATE UNIQUE INDEX operator_one_pending_transfer
  ON operator_transfers((1)) WHERE state = 'pending';
CREATE INDEX operator_pending_successor
  ON operator_transfers(successor_email, state, expires_at);

CREATE TRIGGER operator_transfer_active_predecessor
BEFORE INSERT ON operator_transfers
WHEN NOT EXISTS (
  SELECT 1 FROM operator_account account
  JOIN operator_tenures tenure ON tenure.tenure_number = account.active_tenure_number
  WHERE account.state = 'active'
    AND account.active_tenure_number = new.predecessor_tenure_number
    AND tenure.ended_at IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'operator transfer predecessor is not active');
END;
CREATE TRIGGER operator_transfer_distinct_successor
BEFORE INSERT ON operator_transfers
WHEN EXISTS (
  SELECT 1 FROM operator_account account
  WHERE account.singleton_key = 1 AND account.state = 'active'
    AND account.verified_email = new.successor_email
)
BEGIN
  SELECT RAISE(ABORT, 'operator transfer successor must use a different verified email');
END;
CREATE TRIGGER operator_account_identity_changes_use_transfer
BEFORE UPDATE OF verified_email, active_tenure_number ON operator_account
WHEN old.state = 'active'
  AND (new.verified_email IS NOT old.verified_email
    OR new.active_tenure_number IS NOT old.active_tenure_number)
  AND NOT EXISTS (
    SELECT 1 FROM operator_transfers transfer
    JOIN operator_tenures predecessor
      ON predecessor.tenure_number = transfer.predecessor_tenure_number
      AND predecessor.ended_at IS NOT NULL
      AND predecessor.ending_event = 'accepted-transfer'
    JOIN operator_tenures successor
      ON successor.tenure_number = transfer.predecessor_tenure_number + 1
      AND successor.ended_at IS NULL
    JOIN operator_adult_eligibility eligibility
      ON eligibility.tenure_number = successor.tenure_number
      AND eligibility.confirmed = 1
    WHERE transfer.state = 'pending'
      AND transfer.predecessor_tenure_number = old.active_tenure_number
      AND transfer.successor_email = new.verified_email
      AND transfer.successor_display_name = new.display_name
      AND transfer.successor_current_outpost_id IS new.current_outpost_id
      AND new.active_tenure_number = successor.tenure_number
  )
BEGIN
  SELECT RAISE(ABORT, 'Operator identity changes require an accepted transfer');
END;

CREATE TRIGGER operator_transfers_no_delete
BEFORE DELETE ON operator_transfers BEGIN
  SELECT RAISE(ABORT, 'operator transfer history is append-only');
END;
CREATE TRIGGER operator_transfers_restrict_update
BEFORE UPDATE ON operator_transfers
WHEN old.state <> 'pending' OR new.state = 'pending'
  OR new.id IS NOT old.id
  OR new.predecessor_tenure_number IS NOT old.predecessor_tenure_number
  OR new.initiation_kind IS NOT old.initiation_kind
  OR new.created_at IS NOT old.created_at
  OR new.expires_at IS NOT old.expires_at
  OR new.request_id IS NOT old.request_id
BEGIN
  SELECT RAISE(ABORT, 'terminal operator transfers are immutable');
END;

CREATE TABLE privileged_access_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL CHECK (action IN (
    'account-claimed', 'settings-updated', 'renewed', 'transfer-started',
    'transfer-cancelled', 'transfer-expired', 'transfer-accepted',
    'access-cleanup-confirmed', 'recovery-transfer-staged'
  )),
  actor_tenure_number INTEGER REFERENCES operator_tenures(tenure_number),
  subject_tenure_number INTEGER REFERENCES operator_tenures(tenure_number),
  transfer_id TEXT REFERENCES operator_transfers(id),
  request_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX privileged_access_events_tenure
  ON privileged_access_events(actor_tenure_number, id DESC);
CREATE TRIGGER privileged_access_events_no_update
BEFORE UPDATE ON privileged_access_events BEGIN
  SELECT RAISE(ABORT, 'privileged access events are append-only');
END;
CREATE TRIGGER privileged_access_events_no_delete
BEFORE DELETE ON privileged_access_events BEGIN
  SELECT RAISE(ABORT, 'privileged access events are append-only');
END;

CREATE TRIGGER operator_acceptance_guards_validate
BEFORE INSERT ON operator_acceptance_guards
WHEN NOT EXISTS (
  SELECT 1 FROM operator_transfers transfer
  JOIN operator_account account
    ON account.active_tenure_number = transfer.predecessor_tenure_number
  JOIN operator_tenures tenure
    ON tenure.tenure_number = transfer.predecessor_tenure_number AND tenure.ended_at IS NULL
  WHERE transfer.id = new.transfer_id AND transfer.state = 'pending'
    AND transfer.predecessor_tenure_number = new.predecessor_tenure_number
    AND transfer.successor_email = new.successor_email
    AND transfer.acceptance_token_hash = new.token_hash
    AND transfer.expires_at > new.accepted_at
)
BEGIN
  SELECT RAISE(ABORT, 'Operator acceptance guard is invalid');
END;
CREATE TRIGGER operator_acceptance_guards_no_update
BEFORE UPDATE ON operator_acceptance_guards BEGIN
  SELECT RAISE(ABORT, 'Operator acceptance guards are immutable');
END;
CREATE TRIGGER operator_acceptance_guards_restrict_delete
BEFORE DELETE ON operator_acceptance_guards
WHEN NOT EXISTS (
  SELECT 1 FROM operator_transfers transfer
  JOIN operator_account account ON account.active_tenure_number = transfer.successor_tenure_number
  JOIN operator_tenures tenure
    ON tenure.tenure_number = transfer.successor_tenure_number AND tenure.ended_at IS NULL
  JOIN privileged_access_events event
    ON event.request_id = old.request_id AND event.action = 'transfer-accepted'
  WHERE transfer.id = old.transfer_id AND transfer.state = 'accepted'
    AND transfer.successor_tenure_number = old.predecessor_tenure_number + 1
    AND account.verified_email = old.successor_email
)
BEGIN
  SELECT RAISE(ABORT, 'Operator acceptance guard cannot be cleared before acceptance');
END;

-- A recovery transfer is one atomic INSERT; its non-PII event cannot be omitted.
CREATE TRIGGER operator_recovery_transfer_event
AFTER INSERT ON operator_transfers
WHEN new.initiation_kind = 'recovery'
BEGIN
  INSERT INTO privileged_access_events
    (action, actor_tenure_number, transfer_id, request_id, created_at)
  VALUES (
    'recovery-transfer-staged', new.predecessor_tenure_number, new.id,
    new.request_id || ':event', new.created_at
  );
END;

-- Every new editorial actor is a stable tenure label. Existing rows remain nullable legacy history.
ALTER TABLE content_revisions ADD COLUMN operator_tenure_id INTEGER REFERENCES operator_tenures(tenure_number);
ALTER TABLE content_audit_events ADD COLUMN operator_tenure_id INTEGER REFERENCES operator_tenures(tenure_number);
ALTER TABLE source_health_observations ADD COLUMN observed_operator_tenure_id INTEGER REFERENCES operator_tenures(tenure_number);
ALTER TABLE source_health_observations ADD COLUMN cleared_operator_tenure_id INTEGER REFERENCES operator_tenures(tenure_number);
ALTER TABLE normalized_event_conflicts ADD COLUMN opened_operator_tenure_id INTEGER REFERENCES operator_tenures(tenure_number);
ALTER TABLE normalized_event_conflicts ADD COLUMN resolved_operator_tenure_id INTEGER REFERENCES operator_tenures(tenure_number);
ALTER TABLE event_conflict_resolutions ADD COLUMN operator_tenure_id INTEGER REFERENCES operator_tenures(tenure_number);
ALTER TABLE normalized_coverage_gaps ADD COLUMN created_operator_tenure_id INTEGER REFERENCES operator_tenures(tenure_number);
ALTER TABLE normalized_coverage_gaps ADD COLUMN resolved_operator_tenure_id INTEGER REFERENCES operator_tenures(tenure_number);

DROP TRIGGER content_audit_events_no_update;

UPDATE content_revisions SET actor_label = 'Legacy operator'
WHERE instr(actor_label, '@') > 1;
UPDATE content_audit_events SET actor_label = 'Legacy operator'
WHERE instr(actor_label, '@') > 1;
UPDATE source_health_observations SET observed_by = 'Legacy operator'
WHERE instr(observed_by, '@') > 1;
UPDATE source_health_observations SET cleared_by = 'Legacy operator'
WHERE cleared_by IS NOT NULL AND instr(cleared_by, '@') > 1;
UPDATE normalized_event_conflicts SET opened_by = 'Legacy operator'
WHERE instr(opened_by, '@') > 1;
UPDATE normalized_event_conflicts SET resolved_by = 'Legacy operator'
WHERE resolved_by IS NOT NULL AND instr(resolved_by, '@') > 1;
UPDATE event_conflict_resolutions SET resolved_by = 'Legacy operator'
WHERE instr(resolved_by, '@') > 1;
UPDATE normalized_coverage_gaps SET created_by = 'Legacy operator'
WHERE instr(created_by, '@') > 1;
UPDATE normalized_coverage_gaps SET resolved_by = 'Legacy operator'
WHERE resolved_by IS NOT NULL AND instr(resolved_by, '@') > 1;

-- The retained Slice 1-4/6 tables are recovery evidence too; redact their actor labels
-- without changing actions, reasons, timestamps, or before/after content.
UPDATE audit_events SET actor = 'Legacy operator' WHERE instr(actor, '@') > 1;
DROP TRIGGER legacy_event_conflicts_no_update;
DROP TRIGGER legacy_broken_sources_no_update;
DROP TRIGGER legacy_coverage_gaps_no_update;
UPDATE event_conflicts SET opened_by = 'Legacy operator' WHERE instr(opened_by, '@') > 1;
UPDATE event_conflicts SET resolved_by = 'Legacy operator'
WHERE resolved_by IS NOT NULL AND instr(resolved_by, '@') > 1;
UPDATE broken_source_observations SET observed_by = 'Legacy operator' WHERE instr(observed_by, '@') > 1;
UPDATE broken_source_observations SET cleared_by = 'Legacy operator'
WHERE cleared_by IS NOT NULL AND instr(cleared_by, '@') > 1;
UPDATE coverage_gaps SET created_by = 'Legacy operator' WHERE instr(created_by, '@') > 1;
UPDATE coverage_gaps SET resolved_by = 'Legacy operator'
WHERE resolved_by IS NOT NULL AND instr(resolved_by, '@') > 1;

CREATE TRIGGER legacy_event_conflicts_no_update BEFORE UPDATE ON event_conflicts BEGIN
  SELECT RAISE(ABORT, 'event_conflicts is read-only legacy data');
END;
CREATE TRIGGER legacy_broken_sources_no_update BEFORE UPDATE ON broken_source_observations BEGIN
  SELECT RAISE(ABORT, 'broken_source_observations is read-only legacy data');
END;
CREATE TRIGGER legacy_coverage_gaps_no_update BEFORE UPDATE ON coverage_gaps BEGIN
  SELECT RAISE(ABORT, 'coverage_gaps is read-only legacy data');
END;

CREATE TRIGGER content_audit_events_no_update
BEFORE UPDATE ON content_audit_events BEGIN
  SELECT RAISE(ABORT, 'audit events are append-only');
END;

CREATE TRIGGER content_revisions_operator_label
BEFORE INSERT ON content_revisions
WHEN new.operator_tenure_id IS NOT NULL
  AND new.actor_label <> 'Operator tenure ' || new.operator_tenure_id
BEGIN
  SELECT RAISE(ABORT, 'content revision actor must match its Operator tenure');
END;
CREATE TRIGGER content_audit_events_operator_label
BEFORE INSERT ON content_audit_events
WHEN new.operator_tenure_id IS NOT NULL
  AND new.actor_label <> 'Operator tenure ' || new.operator_tenure_id
BEGIN
  SELECT RAISE(ABORT, 'content audit actor must match its Operator tenure');
END;

CREATE TRIGGER source_health_operator_label
BEFORE INSERT ON source_health_observations
WHEN new.observed_operator_tenure_id IS NOT NULL
  AND new.observed_by <> 'Operator tenure ' || new.observed_operator_tenure_id
BEGIN
  SELECT RAISE(ABORT, 'source-health actor must match its Operator tenure');
END;
CREATE TRIGGER source_health_clear_operator_label
BEFORE UPDATE OF cleared_by, cleared_operator_tenure_id ON source_health_observations
WHEN new.cleared_operator_tenure_id IS NOT NULL
  AND new.cleared_by <> 'Operator tenure ' || new.cleared_operator_tenure_id
BEGIN
  SELECT RAISE(ABORT, 'source-health clearing actor must match its Operator tenure');
END;
CREATE TRIGGER event_conflict_operator_label
BEFORE INSERT ON normalized_event_conflicts
WHEN new.opened_operator_tenure_id IS NOT NULL
  AND new.opened_by <> 'Operator tenure ' || new.opened_operator_tenure_id
BEGIN
  SELECT RAISE(ABORT, 'event-conflict actor must match its Operator tenure');
END;
CREATE TRIGGER event_conflict_close_operator_label
BEFORE UPDATE OF resolved_by, resolved_operator_tenure_id ON normalized_event_conflicts
WHEN new.resolved_operator_tenure_id IS NOT NULL
  AND new.resolved_by <> 'Operator tenure ' || new.resolved_operator_tenure_id
BEGIN
  SELECT RAISE(ABORT, 'event-conflict closing actor must match its Operator tenure');
END;
CREATE TRIGGER event_conflict_resolution_operator_label
BEFORE INSERT ON event_conflict_resolutions
WHEN new.operator_tenure_id IS NOT NULL
  AND new.resolved_by <> 'Operator tenure ' || new.operator_tenure_id
BEGIN
  SELECT RAISE(ABORT, 'event-conflict resolution actor must match its Operator tenure');
END;
CREATE TRIGGER coverage_gap_operator_label
BEFORE INSERT ON normalized_coverage_gaps
WHEN new.created_operator_tenure_id IS NOT NULL
  AND new.created_by <> 'Operator tenure ' || new.created_operator_tenure_id
BEGIN
  SELECT RAISE(ABORT, 'coverage-gap actor must match its Operator tenure');
END;
CREATE TRIGGER coverage_gap_resolution_operator_label
BEFORE UPDATE OF resolved_by, resolved_operator_tenure_id ON normalized_coverage_gaps
WHEN new.resolved_operator_tenure_id IS NOT NULL
  AND new.resolved_by <> 'Operator tenure ' || new.resolved_operator_tenure_id
BEGIN
  SELECT RAISE(ABORT, 'coverage-gap resolution actor must match its Operator tenure');
END;

-- Batch transition guards turn a zero-row conditional update into a full rollback.
CREATE TABLE operator_transition_checks (
  transition_kind TEXT NOT NULL CHECK (transition_kind IN ('claim', 'settings', 'renew', 'cancel', 'expire', 'accept', 'cleanup', 'recovery')),
  request_id TEXT NOT NULL,
  expected_email TEXT,
  expected_tenure_number INTEGER,
  transfer_id TEXT,
  expected_due_at TEXT,
  checked_at TEXT NOT NULL
);

CREATE TRIGGER operator_transition_check
BEFORE INSERT ON operator_transition_checks
WHEN
  (new.transition_kind = 'claim' AND NOT EXISTS (
    SELECT 1 FROM operator_account account
    JOIN privileged_access_events event ON event.request_id = new.request_id
    WHERE account.state = 'active' AND account.verified_email = new.expected_email
      AND account.active_tenure_number = new.expected_tenure_number
      AND event.action = 'account-claimed'
  ))
  OR
  (new.transition_kind IN ('settings', 'cleanup') AND NOT EXISTS (
    SELECT 1 FROM operator_account account
    JOIN privileged_access_events event ON event.request_id = new.request_id
    WHERE account.state = 'active' AND account.active_tenure_number = new.expected_tenure_number
      AND (new.expected_due_at IS NULL OR account.renewal_due_at = new.expected_due_at)
  ))
  OR
  (new.transition_kind = 'renew' AND NOT EXISTS (
    SELECT 1 FROM operator_account account
    JOIN operator_renewal_events renewal ON renewal.request_id = new.request_id
    JOIN privileged_access_events event ON event.request_id = new.request_id
    WHERE account.state = 'active' AND account.active_tenure_number = new.expected_tenure_number
      AND account.renewal_due_at = new.expected_due_at
      AND renewal.tenure_number = new.expected_tenure_number
      AND renewal.new_due_at = new.expected_due_at
      AND event.action = 'renewed'
  ))
  OR
  (new.transition_kind IN ('cancel', 'expire') AND NOT EXISTS (
    SELECT 1 FROM operator_transfers transfer
    JOIN privileged_access_events event ON event.request_id = new.request_id
    WHERE transfer.id = new.transfer_id
      AND transfer.state = CASE new.transition_kind WHEN 'cancel' THEN 'cancelled' ELSE 'expired' END
  ))
  OR
  (new.transition_kind = 'accept' AND NOT EXISTS (
    SELECT 1 FROM operator_transfers transfer
    JOIN operator_account account ON account.active_tenure_number = transfer.successor_tenure_number
    JOIN privileged_access_events event ON event.request_id = new.request_id
    WHERE transfer.id = new.transfer_id AND transfer.state = 'accepted'
      AND account.verified_email = new.expected_email
      AND account.active_tenure_number = new.expected_tenure_number
      AND event.action = 'transfer-accepted'
  ))
  OR
  (new.transition_kind = 'recovery' AND NOT EXISTS (
    SELECT 1 FROM operator_transfers transfer
    JOIN privileged_access_events event ON event.transfer_id = transfer.id
    WHERE transfer.id = new.transfer_id AND transfer.state = 'pending'
      AND transfer.initiation_kind = 'recovery'
      AND event.action = 'recovery-transfer-staged'
      AND event.request_id = new.request_id || ':event'
  ))
BEGIN
  SELECT RAISE(ABORT, 'operator lifecycle transition conflict');
END;

CREATE TRIGGER operator_transition_check_cleanup
AFTER INSERT ON operator_transition_checks BEGIN
  DELETE FROM operator_transition_checks WHERE rowid = new.rowid;
END;

CREATE TABLE migration_0008_assertions (
  name TEXT PRIMARY KEY,
  passed INTEGER NOT NULL CHECK (passed = 1),
  checked_at TEXT NOT NULL
);

INSERT INTO migration_0008_assertions (name, passed, checked_at)
SELECT 'exactly one unclaimed Operator Account without PII',
  CASE WHEN (SELECT COUNT(*) FROM operator_account) = 1
    AND EXISTS (SELECT 1 FROM operator_account WHERE singleton_key = 1 AND state = 'unclaimed'
      AND display_name IS NULL AND verified_email IS NULL AND active_tenure_number IS NULL)
  THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0008_assertions (name, passed, checked_at)
SELECT 'no initial active Operator tenure',
  CASE WHEN NOT EXISTS (SELECT 1 FROM operator_tenures WHERE ended_at IS NULL) THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0008_assertions (name, passed, checked_at)
SELECT 'no Birth Year or birth date column exists',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM sqlite_schema
    WHERE type = 'table' AND (
      lower(COALESCE(sql, '')) LIKE '%birth%year%'
      OR lower(COALESCE(sql, '')) LIKE '%birth%date%'
    )
  ) THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0008_assertions (name, passed, checked_at)
SELECT 'at most one pending transfer',
  CASE WHEN (SELECT COUNT(*) FROM operator_transfers WHERE state = 'pending') <= 1 THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0008_assertions (name, passed, checked_at)
SELECT 'Operator tenure audit references have no orphans',
  CASE WHEN NOT EXISTS (SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0008_assertions (name, passed, checked_at)
SELECT 'legacy email-shaped actor labels are redacted',
  CASE WHEN
    (SELECT COUNT(*) FROM content_revisions WHERE instr(actor_label, '@') > 1)
    + (SELECT COUNT(*) FROM content_audit_events WHERE instr(actor_label, '@') > 1)
    + (SELECT COUNT(*) FROM source_health_observations WHERE instr(observed_by, '@') > 1)
    + (SELECT COUNT(*) FROM normalized_event_conflicts WHERE instr(opened_by, '@') > 1)
    + (SELECT COUNT(*) FROM normalized_coverage_gaps WHERE instr(created_by, '@') > 1)
    + (SELECT COUNT(*) FROM audit_events WHERE instr(actor, '@') > 1)
    + (SELECT COUNT(*) FROM event_conflicts WHERE instr(opened_by, '@') > 1)
    + (SELECT COUNT(*) FROM broken_source_observations WHERE instr(observed_by, '@') > 1)
    + (SELECT COUNT(*) FROM coverage_gaps WHERE instr(created_by, '@') > 1)
    = 0 THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

INSERT INTO migration_0008_assertions (name, passed, checked_at)
SELECT 'lifecycle histories are append-only',
  CASE WHEN (
    SELECT COUNT(*) FROM sqlite_schema
    WHERE type = 'trigger' AND name IN (
      'operator_tenures_no_delete', 'operator_adult_eligibility_no_delete',
      'operator_renewal_events_no_delete', 'operator_renewal_notices_no_delete',
      'operator_transfers_no_delete', 'privileged_access_events_no_delete'
    )
  ) = 6 THEN 1 ELSE 0 END,
  '2026-08-13T00:00:00.000Z';

PRAGMA optimize;
