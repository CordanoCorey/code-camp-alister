-- Slice 16: private verified membership and exact-scope delegated authority.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE membership_requests (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  outpost_id TEXT NOT NULL REFERENCES outposts(content_id),
  state TEXT NOT NULL CHECK (state IN ('pending', 'approved', 'rejected', 'withdrawn')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL,
  ended_at TEXT,
  decided_by_auth_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK ((state = 'pending' AND ended_at IS NULL) OR (state <> 'pending' AND ended_at IS NOT NULL)),
  CHECK (decided_by_auth_user_id IS NULL OR decided_by_auth_user_id <> auth_user_id)
);
CREATE UNIQUE INDEX membership_requests_one_pending ON membership_requests(auth_user_id) WHERE state = 'pending';
CREATE INDEX membership_requests_review_queue ON membership_requests(outpost_id, state, created_at, id);

CREATE TABLE outpost_memberships (
  id TEXT PRIMARY KEY,
  request_id TEXT UNIQUE REFERENCES membership_requests(id) ON DELETE SET NULL,
  auth_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  outpost_id TEXT NOT NULL REFERENCES outposts(content_id),
  state TEXT NOT NULL CHECK (state IN ('verified', 'rejected', 'withdrawn', 'revoked', 'ended')),
  issuer_auth_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL,
  ended_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK ((state = 'verified' AND ended_at IS NULL) OR (state <> 'verified' AND ended_at IS NOT NULL))
);
CREATE UNIQUE INDEX outpost_memberships_one_active_per_account ON outpost_memberships(auth_user_id) WHERE state = 'verified';
CREATE INDEX outpost_memberships_member_access ON outpost_memberships(auth_user_id, outpost_id, state);
CREATE INDEX outpost_memberships_roster_review ON outpost_memberships(outpost_id, state, created_at, id);

CREATE TABLE position_verifications (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  position_label TEXT NOT NULL CHECK (length(trim(position_label)) BETWEEN 1 AND 80),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('outpost','district','region','national','international','fcf','country-defined')),
  scope_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('verified','revoked','ended')),
  issuer_auth_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL, ended_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK (issuer_auth_user_id IS NULL OR issuer_auth_user_id <> auth_user_id),
  CHECK ((state = 'verified' AND ended_at IS NULL) OR (state <> 'verified' AND ended_at IS NOT NULL))
);
CREATE INDEX position_verifications_subject ON position_verifications(auth_user_id, state, scope_type, scope_id);

CREATE TABLE pastor_appointments (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  outpost_id TEXT NOT NULL REFERENCES outposts(content_id),
  state TEXT NOT NULL CHECK (state IN ('active','replaced','revoked','ended')),
  issuer_auth_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL, ended_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  CHECK (issuer_auth_user_id IS NULL OR issuer_auth_user_id <> auth_user_id),
  CHECK ((state = 'active' AND ended_at IS NULL) OR (state <> 'active' AND ended_at IS NOT NULL))
);
CREATE UNIQUE INDEX pastor_appointments_one_active ON pastor_appointments(outpost_id) WHERE state = 'active';
CREATE INDEX pastor_appointments_subject ON pastor_appointments(auth_user_id, state, outpost_id);

CREATE TABLE permission_grants (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  capability TEXT NOT NULL CHECK (capability IN ('view-outpost-private','review-outpost-membership','manage-outpost-permissions','edit-outpost-draft','verify-outpost-facts','publish-outpost-facts','edit-scope-conflicts','resolve-scope-conflicts')),
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
CREATE UNIQUE INDEX permission_grants_one_active ON permission_grants(auth_user_id, capability, scope_type, scope_id) WHERE state = 'active';
CREATE INDEX permission_grants_authorization ON permission_grants(auth_user_id, scope_type, scope_id, capability, state, ends_at);
CREATE INDEX permission_grants_membership_cascade ON permission_grants(source_membership_id, state);

CREATE TABLE permission_events (
  id TEXT PRIMARY KEY,
  grant_id TEXT,
  subject_label TEXT NOT NULL DEFAULT 'Private Account' CHECK (subject_label = 'Private Account'),
  capability TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('granted','revoked','expired')),
  issuer_label TEXT NOT NULL CHECK (issuer_label IN ('Verified Outpost Editor','Service Operator','Deleted Account')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL
);
CREATE INDEX permission_events_scope_history ON permission_events(scope_type, scope_id, created_at, id);
CREATE TRIGGER permission_events_no_update BEFORE UPDATE ON permission_events BEGIN SELECT RAISE(ABORT, 'permission events are immutable'); END;
CREATE TRIGGER permission_events_no_delete BEFORE DELETE ON permission_events BEGIN SELECT RAISE(ABORT, 'permission events are immutable'); END;

CREATE TABLE conflict_assignments (
  id TEXT PRIMARY KEY,
  conflict_id TEXT NOT NULL REFERENCES normalized_event_conflicts(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('outpost','district','region','national','international','fcf','country-defined','external-council')),
  scope_id TEXT NOT NULL,
  resolver_office_label TEXT NOT NULL CHECK (length(trim(resolver_office_label)) BETWEEN 1 AND 100),
  required_capability TEXT NOT NULL CHECK (required_capability = 'resolve-scope-conflicts'),
  review_state TEXT NOT NULL CHECK (review_state IN ('assigned','external-council-review','resolved')),
  issuer_auth_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL, ended_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE UNIQUE INDEX conflict_assignments_active ON conflict_assignments(conflict_id) WHERE ended_at IS NULL;
CREATE INDEX conflict_assignments_resolver_queue ON conflict_assignments(scope_type, scope_id, review_state, created_at, id);

CREATE TABLE migration_0014_assertions (name TEXT PRIMARY KEY, passed INTEGER NOT NULL CHECK (passed = 1));
INSERT INTO migration_0014_assertions(name, passed) VALUES
 ('private-authority-tables', CASE WHEN (SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name IN ('membership_requests','outpost_memberships','position_verifications','pastor_appointments','permission_grants','permission_events','conflict_assignments')) = 7 THEN 1 ELSE 0 END),
 ('one-active-pastor-index', CASE WHEN EXISTS (SELECT 1 FROM sqlite_schema WHERE type='index' AND name='pastor_appointments_one_active' AND sql LIKE '%WHERE state = ''active''%') THEN 1 ELSE 0 END),
 ('exact-scope-authorization-index', CASE WHEN EXISTS (SELECT 1 FROM sqlite_schema WHERE type='index' AND name='permission_grants_authorization') THEN 1 ELSE 0 END),
 ('public-projections-remain-private', CASE WHEN NOT EXISTS (SELECT 1 FROM sqlite_schema s, pragma_table_info(s.name) f WHERE s.type='table' AND s.name LIKE 'public_%' AND lower(f.name) IN ('membership','auth_user_id','permission','position','email','roster')) THEN 1 ELSE 0 END);
