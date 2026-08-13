-- Slice 18B: private Outpost plans linked to published Reference Calendar occurrences.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE reference_event_plans (
  id TEXT PRIMARY KEY,
  calendar_entry_id TEXT NOT NULL UNIQUE REFERENCES outpost_calendar_entries(id),
  outpost_id TEXT NOT NULL REFERENCES outpost_workspaces(outpost_id),
  reference_content_id TEXT NOT NULL REFERENCES content_records(id),
  occurrence_id TEXT NOT NULL,
  request_key TEXT NOT NULL CHECK (length(request_key) BETWEEN 8 AND 100),
  reference_version INTEGER NOT NULL CHECK (reference_version >= 1),
  reference_checked_at TEXT NOT NULL,
  plan_status TEXT NOT NULL CHECK (plan_status IN ('considering','planning-to-attend','confirmed-by-outpost','no-longer-attending','cancelled')),
  private_note TEXT CHECK (private_note IS NULL OR length(private_note) <= 300),
  snapshot_title TEXT NOT NULL CHECK (length(snapshot_title) BETWEEN 1 AND 120),
  snapshot_start_date TEXT NOT NULL,
  snapshot_end_date TEXT,
  snapshot_start_time TEXT,
  snapshot_end_time TEXT,
  snapshot_all_day INTEGER NOT NULL CHECK (snapshot_all_day IN (0,1)),
  snapshot_time_zone TEXT NOT NULL,
  snapshot_location TEXT,
  snapshot_location_status TEXT NOT NULL,
  snapshot_host TEXT NOT NULL,
  snapshot_scope TEXT NOT NULL,
  snapshot_lifecycle_status TEXT NOT NULL,
  snapshot_registration_status TEXT NOT NULL,
  snapshot_registration_deadline TEXT,
  snapshot_registration_url TEXT,
  snapshot_official_url TEXT NOT NULL,
  snapshot_required_conflict INTEGER NOT NULL CHECK (snapshot_required_conflict IN (0,1)),
  review_state TEXT NOT NULL CHECK (review_state IN ('current','review-required')),
  review_reason_code TEXT CHECK (review_reason_code IS NULL OR review_reason_code IN ('schedule-changed','timezone-changed','lifecycle-changed','location-changed','registration-changed','required-fact-conflict-opened','required-fact-conflict-closed','event-unpublished')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT,
  detached_at TEXT,
  last_mutation_id TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE(outpost_id, request_key),
  CHECK ((review_state='current' AND review_reason_code IS NULL) OR (review_state='review-required' AND review_reason_code IS NOT NULL)),
  CHECK ((detached_at IS NULL) OR plan_status IN ('no-longer-attending','cancelled'))
);
CREATE INDEX reference_event_plans_outpost_entry ON reference_event_plans(outpost_id,calendar_entry_id);
CREATE INDEX reference_event_plans_outpost_dates ON reference_event_plans(outpost_id,snapshot_start_date,id);
CREATE INDEX reference_event_plans_review_queue ON reference_event_plans(outpost_id,review_state,updated_at,id);
CREATE INDEX reference_event_plans_event_change ON reference_event_plans(reference_content_id,occurrence_id,review_state,id);
CREATE UNIQUE INDEX reference_event_plans_one_active_occurrence ON reference_event_plans(outpost_id,reference_content_id,occurrence_id) WHERE detached_at IS NULL;

CREATE TABLE reference_event_plan_events (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  outpost_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created','status-changed','review-flagged','snapshot-refreshed','detached','cancelled')),
  actor_label TEXT NOT NULL CHECK (actor_label IN ('Verified Outpost Editor','Service Operator','Deleted Account')),
  summary TEXT NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 240),
  plan_version INTEGER NOT NULL CHECK (plan_version >= 1),
  created_at TEXT NOT NULL
);
CREATE INDEX reference_event_plan_events_history ON reference_event_plan_events(outpost_id,plan_id,created_at,id);
CREATE TRIGGER reference_event_plan_events_no_update BEFORE UPDATE ON reference_event_plan_events BEGIN SELECT RAISE(ABORT,'reference plan events are immutable'); END;
CREATE TRIGGER reference_event_plan_events_no_delete BEFORE DELETE ON reference_event_plan_events BEGIN SELECT RAISE(ABORT,'reference plan events are immutable'); END;

CREATE TRIGGER reference_event_plan_exact_outpost_insert BEFORE INSERT ON reference_event_plans
WHEN NOT EXISTS (SELECT 1 FROM outpost_calendar_entries entry WHERE entry.id=NEW.calendar_entry_id AND entry.outpost_id=NEW.outpost_id)
BEGIN SELECT RAISE(ABORT,'reference plan outpost mismatch'); END;
CREATE TRIGGER reference_event_plan_occurrence_insert BEFORE INSERT ON reference_event_plans
WHEN NOT EXISTS (SELECT 1 FROM event_occurrences event JOIN content_records content ON content.id=event.content_id
  WHERE event.content_id=NEW.reference_content_id AND event.occurrence_id=NEW.occurrence_id AND content.kind='event' AND content.status='published')
BEGIN SELECT RAISE(ABORT,'reference occurrence unavailable'); END;

CREATE TABLE migration_0017_assertions (name TEXT PRIMARY KEY, passed INTEGER NOT NULL CHECK (passed=1));
INSERT INTO migration_0017_assertions(name,passed) VALUES
 ('reference-plan-tables',CASE WHEN (SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name IN ('reference_event_plans','reference_event_plan_events'))=2 THEN 1 ELSE 0 END),
 ('reference-plan-review-index',CASE WHEN EXISTS(SELECT 1 FROM sqlite_schema WHERE type='index' AND name='reference_event_plans_review_queue') THEN 1 ELSE 0 END),
 ('reference-plan-event-index',CASE WHEN EXISTS(SELECT 1 FROM sqlite_schema WHERE type='index' AND name='reference_event_plans_event_change') THEN 1 ELSE 0 END),
 ('reference-plan-private-only',CASE WHEN NOT EXISTS(SELECT 1 FROM sqlite_schema WHERE type='view' AND name LIKE 'public_%' AND lower(sql) LIKE '%reference_event_plan%') THEN 1 ELSE 0 END);
