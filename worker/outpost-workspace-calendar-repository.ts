import { validateCalendarEntryInput, validateWorkspaceTimezone } from '../shared/outpost-workspace-calendar'

export class WorkspaceCalendarError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

type Access = { outpostId: string; canManage: boolean }

async function access(db: D1Database, authUserId: string, now: string): Promise<Access> {
  const row = await db.prepare(`SELECT membership.outpost_id outpostId,
      EXISTS(SELECT 1 FROM permission_grants editor
        WHERE editor.auth_user_id = membership.auth_user_id AND editor.scope_type = 'outpost'
          AND editor.scope_id = membership.outpost_id AND editor.capability = 'manage-outpost-calendar'
          AND editor.state = 'active' AND (editor.ends_at IS NULL OR editor.ends_at > ?)) canManage
    FROM outpost_memberships membership
    JOIN permission_grants viewer ON viewer.auth_user_id = membership.auth_user_id
      AND viewer.scope_type = 'outpost' AND viewer.scope_id = membership.outpost_id
      AND viewer.capability = 'view-outpost-private' AND viewer.state = 'active'
      AND (viewer.ends_at IS NULL OR viewer.ends_at > ?)
    WHERE membership.auth_user_id = ? AND membership.state = 'verified'
    LIMIT 1`).bind(now, now, authUserId).first<{ outpostId: string; canManage: number }>()
  if (!row) throw new WorkspaceCalendarError('Workspace unavailable.', 404)
  return { outpostId: row.outpostId, canManage: row.canManage === 1 }
}

async function requireEditor(db: D1Database, authUserId: string, now: string) {
  const result = await access(db, authUserId, now)
  if (!result.canManage) throw new WorkspaceCalendarError('Workspace unavailable.', 404)
  return result
}

export async function getWorkspaceSummary(db: D1Database, authUserId: string, now: string) {
  const allowed = await access(db, authUserId, now)
  const workspace = await db.prepare(`SELECT workspace.outpost_id outpostId, workspace.time_zone timeZone,
      CASE WHEN content.status = 'archived' THEN 'read-only' ELSE workspace.state END state,
      workspace.created_at createdAt, workspace.updated_at updatedAt, workspace.version
    FROM outpost_workspaces workspace JOIN content_records content ON content.id = workspace.outpost_id
    WHERE workspace.outpost_id = ?`)
    .bind(allowed.outpostId).first()
  return { workspace, canManage: allowed.canManage }
}

export async function setWorkspaceTimezone(db: D1Database, authUserId: string, input: { timeZone: unknown; expectedVersion: unknown }, now: string) {
  const allowed = await requireEditor(db, authUserId, now)
  const timeZone = validateWorkspaceTimezone(input.timeZone)
  const outpost = await db.prepare('SELECT status FROM content_records WHERE id = ?').bind(allowed.outpostId).first<{ status: string }>()
  if (outpost?.status === 'archived') throw new WorkspaceCalendarError('Workspace is read-only.', 423)
  const current = await db.prepare('SELECT version, state FROM outpost_workspaces WHERE outpost_id = ?')
    .bind(allowed.outpostId).first<{ version: number; state: string }>()
  if (!current) {
    if (input.expectedVersion !== null && input.expectedVersion !== undefined) throw new WorkspaceCalendarError('Workspace changed.', 409)
    await db.prepare(`INSERT INTO outpost_workspaces (outpost_id,time_zone,state,created_at,updated_at,version)
      VALUES (?,?,'active',?,?,1)`).bind(allowed.outpostId, timeZone, now, now).run()
  } else {
    if (current.state !== 'active') throw new WorkspaceCalendarError('Workspace is read-only.', 423)
    if (!Number.isInteger(input.expectedVersion) || current.version !== input.expectedVersion) throw new WorkspaceCalendarError('Workspace changed.', 409)
    const result = await db.prepare(`UPDATE outpost_workspaces SET time_zone=?,updated_at=?,version=version+1
      WHERE outpost_id=? AND state='active' AND version=?`).bind(timeZone, now, allowed.outpostId, current.version).run()
    if ((result.meta.changes ?? 0) !== 1) throw new WorkspaceCalendarError('Workspace changed.', 409)
  }
  return getWorkspaceSummary(db, authUserId, now)
}

function range(params: URLSearchParams) {
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw new WorkspaceCalendarError('Choose a valid bounded date range.', 400)
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  if (days > 93) throw new WorkspaceCalendarError('Calendar ranges are limited to 93 days.', 400)
  const limit = Number(params.get('limit') ?? 50)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new WorkspaceCalendarError('Calendar page size is invalid.', 400)
  return { from, to, limit }
}

export async function listCalendarEntries(db: D1Database, authUserId: string, params: URLSearchParams, now: string) {
  const allowed = await access(db, authUserId, now)
  const input = range(params)
  const { results } = await db.prepare(`SELECT id,title,description,category,start_date startDate,end_date endDate,
      start_time startTime,end_time endTime,all_day allDay,time_zone timeZone,location,status,
      created_at createdAt,updated_at updatedAt,cancelled_at cancelledAt,version
    FROM outpost_calendar_entries WHERE outpost_id=? AND start_date<=? AND end_date>=?
    ORDER BY start_date,start_time,id LIMIT ?`).bind(allowed.outpostId, input.to, input.from, input.limit + 1).all<Record<string, unknown>>()
  return { items: results.slice(0, input.limit), hasMore: results.length > input.limit }
}

export async function getCalendarEntry(db: D1Database, authUserId: string, entryId: string, now: string) {
  const allowed = await access(db, authUserId, now)
  const entry = await db.prepare(`SELECT id,title,description,category,start_date startDate,end_date endDate,start_time startTime,
      end_time endTime,all_day allDay,time_zone timeZone,location,status,created_at createdAt,updated_at updatedAt,
      cancelled_at cancelledAt,version FROM outpost_calendar_entries WHERE id=? AND outpost_id=?`)
    .bind(entryId, allowed.outpostId).first()
  if (!entry) throw new WorkspaceCalendarError('Calendar entry unavailable.', 404)
  return entry
}

async function activeWorkspace(db: D1Database, outpostId: string) {
  const workspace = await db.prepare(`SELECT workspace.time_zone timeZone,
      CASE WHEN content.status = 'archived' THEN 'read-only' ELSE workspace.state END state
    FROM outpost_workspaces workspace JOIN content_records content ON content.id=workspace.outpost_id
    WHERE workspace.outpost_id=?`)
    .bind(outpostId).first<{ timeZone: string; state: string }>()
  if (!workspace) throw new WorkspaceCalendarError('Set the workspace timezone before creating entries.', 409)
  if (workspace.state !== 'active') throw new WorkspaceCalendarError('Workspace is read-only.', 423)
  return workspace
}

export async function createCalendarEntry(db: D1Database, authUserId: string, value: unknown, now: string) {
  const allowed = await requireEditor(db, authUserId, now)
  const workspace = await activeWorkspace(db, allowed.outpostId)
  const input = validateCalendarEntryInput(value)
  const id = crypto.randomUUID()
  try {
    await db.batch([
      db.prepare(`INSERT INTO outpost_calendar_entries (id,outpost_id,request_key,title,description,category,start_date,end_date,start_time,end_time,all_day,time_zone,location,status,created_at,updated_at,version)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).bind(id,allowed.outpostId,input.requestKey,input.title,input.description,input.category,input.startDate,input.endDate,input.startTime,input.endTime,input.allDay?1:0,workspace.timeZone,input.location,input.status,now,now),
      db.prepare(`INSERT INTO calendar_entry_events (id,entry_id,outpost_id,event_type,actor_label,summary,entry_version,created_at)
        VALUES (?,?,?,'created','Verified Outpost Editor','Group calendar entry created.',1,?)`).bind(crypto.randomUUID(),id,allowed.outpostId,now),
    ])
  } catch { throw new WorkspaceCalendarError('Calendar entry request was already used or could not be saved.', 409) }
  return getCalendarEntry(db, authUserId, id, now)
}

export async function updateCalendarEntry(db: D1Database, authUserId: string, entryId: string, value: unknown, expectedVersion: unknown, now: string) {
  const allowed = await requireEditor(db, authUserId, now)
  const workspace = await activeWorkspace(db, allowed.outpostId)
  const input = validateCalendarEntryInput(value)
  if (!Number.isInteger(expectedVersion)) throw new WorkspaceCalendarError('Calendar entry changed.', 409)
  const eventId = crypto.randomUUID()
  await db.batch([
    db.prepare(`UPDATE outpost_calendar_entries SET title=?,description=?,category=?,start_date=?,end_date=?,start_time=?,end_time=?,all_day=?,time_zone=?,location=?,status=?,updated_at=?,version=version+1
      WHERE id=? AND outpost_id=? AND status<>'cancelled' AND version=?`).bind(input.title,input.description,input.category,input.startDate,input.endDate,input.startTime,input.endTime,input.allDay?1:0,workspace.timeZone,input.location,input.status,now,entryId,allowed.outpostId,expectedVersion),
    db.prepare(`INSERT INTO calendar_entry_events (id,entry_id,outpost_id,event_type,actor_label,summary,entry_version,created_at)
      SELECT ?,id,outpost_id,'updated','Verified Outpost Editor','Group calendar entry updated.',version,?
      FROM outpost_calendar_entries WHERE id=? AND outpost_id=? AND version=? AND updated_at=?`).bind(eventId,now,entryId,allowed.outpostId,Number(expectedVersion)+1,now),
  ])
  const event = await db.prepare('SELECT id FROM calendar_entry_events WHERE id=?').bind(eventId).first()
  if (!event) throw new WorkspaceCalendarError('Calendar entry changed.', 409)
  return getCalendarEntry(db, authUserId, entryId, now)
}

export async function cancelCalendarEntry(db: D1Database, authUserId: string, entryId: string, expectedVersion: unknown, now: string) {
  const allowed = await requireEditor(db, authUserId, now)
  await activeWorkspace(db, allowed.outpostId)
  if (!Number.isInteger(expectedVersion)) throw new WorkspaceCalendarError('Calendar entry changed.', 409)
  const eventId = crypto.randomUUID()
  await db.batch([
    db.prepare(`UPDATE outpost_calendar_entries SET status='cancelled',cancelled_at=?,updated_at=?,version=version+1
      WHERE id=? AND outpost_id=? AND status<>'cancelled' AND version=?`).bind(now,now,entryId,allowed.outpostId,expectedVersion),
    db.prepare(`INSERT INTO calendar_entry_events (id,entry_id,outpost_id,event_type,actor_label,summary,entry_version,created_at)
      SELECT ?,id,outpost_id,'cancelled','Verified Outpost Editor','Group calendar entry cancelled.',version,?
      FROM outpost_calendar_entries WHERE id=? AND outpost_id=? AND version=? AND cancelled_at=?`).bind(eventId,now,entryId,allowed.outpostId,Number(expectedVersion)+1,now),
  ])
  const event = await db.prepare('SELECT id FROM calendar_entry_events WHERE id=?').bind(eventId).first()
  if (!event) throw new WorkspaceCalendarError('Calendar entry changed.', 409)
  return getCalendarEntry(db, authUserId, entryId, now)
}

export async function listCalendarHistory(db: D1Database, authUserId: string, entryId: string, now: string) {
  const allowed = await access(db, authUserId, now)
  const { results } = await db.prepare(`SELECT event_type eventType,actor_label actorLabel,summary,entry_version entryVersion,created_at createdAt
    FROM calendar_entry_events WHERE outpost_id=? AND entry_id=? ORDER BY created_at,id LIMIT 100`)
    .bind(allowed.outpostId,entryId).all()
  return results
}
