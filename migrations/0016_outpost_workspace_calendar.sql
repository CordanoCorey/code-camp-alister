-- Slice 17: one private workspace and group calendar per canonical Outpost.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE permission_grants_0016 (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  capability TEXT NOT NULL CHECK (capability IN ('view-outpost-private','review-outpost-membership','manage-outpost-permissions','edit-outpost-draft','verify-outpost-facts','publish-outpost-facts','edit-scope-conflicts','resolve-scope-conflicts','manage-outpost-calendar')),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('outpost','district','region','national','international','fcf','country-defined')),
  scope_id TEXT NOT NULL,
  source_membership_id TEXT REFERENCES outpost_memberships(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('active','revoked','expired')),
  issuer_auth_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL, ends_at TEXT, ended_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK (issuer_auth_user_id IS NULL OR issuer_auth_user_id <> auth_user_id),
  CHECK ((state = 'active' AND ended_at IS NULL) OR (state <> 'active' AND ended_at IS NOT NULL)),
  CHECK (source_membership_id IS NULL OR scope_type = 'outpost'),
  CHECK (capability IN ('edit-scope-conflicts','resolve-scope-conflicts') OR scope_type = 'outpost')
);
INSERT INTO permission_grants_0016 SELECT * FROM permission_grants;
DROP TABLE permission_grants;
ALTER TABLE permission_grants_0016 RENAME TO permission_grants;
CREATE UNIQUE INDEX permission_grants_one_active ON permission_grants(auth_user_id, capability, scope_type, scope_id) WHERE state = 'active';
CREATE INDEX permission_grants_authorization ON permission_grants(auth_user_id, scope_type, scope_id, capability, state, ends_at);
CREATE INDEX permission_grants_membership_cascade ON permission_grants(source_membership_id, state);

CREATE TABLE outpost_workspaces (
  outpost_id TEXT PRIMARY KEY REFERENCES outposts(content_id),
  time_zone TEXT NOT NULL CHECK (length(time_zone) BETWEEN 3 AND 80),
  state TEXT NOT NULL CHECK (state IN ('active','read-only')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)
);

CREATE TABLE outpost_calendar_entries (
  id TEXT PRIMARY KEY,
  outpost_id TEXT NOT NULL REFERENCES outpost_workspaces(outpost_id),
  request_key TEXT NOT NULL CHECK (length(request_key) BETWEEN 8 AND 100),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 1000),
  category TEXT NOT NULL CHECK (category IN ('meeting','camp','service','training','ceremony','fundraiser','other')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  all_day INTEGER NOT NULL CHECK (all_day IN (0,1)),
  time_zone TEXT NOT NULL,
  location TEXT CHECK (location IS NULL OR length(location) <= 200),
  status TEXT NOT NULL CHECK (status IN ('tentative','planned','confirmed','cancelled','completed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  cancelled_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE(outpost_id, request_key),
  CHECK (end_date >= start_date),
  CHECK ((all_day = 1 AND start_time IS NULL AND end_time IS NULL) OR (all_day = 0 AND start_time IS NOT NULL)),
  CHECK ((status = 'cancelled' AND cancelled_at IS NOT NULL) OR (status <> 'cancelled' AND cancelled_at IS NULL))
);
CREATE INDEX outpost_calendar_entries_range ON outpost_calendar_entries(outpost_id, start_date, id);
CREATE INDEX outpost_calendar_entries_status_range ON outpost_calendar_entries(outpost_id, status, start_date, id);

CREATE TABLE calendar_entry_events (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  outpost_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created','updated','cancelled')),
  actor_label TEXT NOT NULL CHECK (actor_label IN ('Verified Outpost Editor','Service Operator','Deleted Account')),
  summary TEXT NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 240),
  entry_version INTEGER NOT NULL CHECK (entry_version >= 1),
  created_at TEXT NOT NULL
);
CREATE INDEX calendar_entry_events_history ON calendar_entry_events(outpost_id, entry_id, created_at, id);
CREATE TRIGGER calendar_entry_events_no_update BEFORE UPDATE ON calendar_entry_events BEGIN SELECT RAISE(ABORT, 'calendar entry events are immutable'); END;
CREATE TRIGGER calendar_entry_events_no_delete BEFORE DELETE ON calendar_entry_events BEGIN SELECT RAISE(ABORT, 'calendar entry events are immutable'); END;

CREATE TABLE migration_0016_assertions (name TEXT PRIMARY KEY, passed INTEGER NOT NULL CHECK (passed = 1));
INSERT INTO migration_0016_assertions(name, passed) VALUES
 ('workspace-calendar-tables', CASE WHEN (SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name IN ('outpost_workspaces','outpost_calendar_entries','calendar_entry_events')) = 3 THEN 1 ELSE 0 END),
 ('calendar-range-index', CASE WHEN EXISTS (SELECT 1 FROM sqlite_schema WHERE type='index' AND name='outpost_calendar_entries_range') THEN 1 ELSE 0 END),
 ('calendar-capability', CASE WHEN (SELECT sql FROM sqlite_schema WHERE type='table' AND name='permission_grants') LIKE '%manage-outpost-calendar%' THEN 1 ELSE 0 END),
 ('no-private-public-fields', CASE WHEN NOT EXISTS (SELECT 1 FROM sqlite_schema s, pragma_table_info(s.name) f WHERE s.type='table' AND s.name LIKE 'public_%' AND lower(f.name) IN ('workspace','calendar_entry','membership','permission','actor_label')) THEN 1 ELSE 0 END);
