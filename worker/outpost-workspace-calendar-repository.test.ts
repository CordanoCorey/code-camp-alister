import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cancelCalendarEntry, createCalendarEntry, getCalendarEntry, getWorkspaceSummary, listCalendarEntries, setWorkspaceTimezone, updateCalendarEntry } from './outpost-workspace-calendar-repository'
import { createMigratedD1 } from './test-sqlite-d1'

const now='2026-08-13T12:00:00.000Z', outpost='outpost-stx-70'
let migrated:ReturnType<typeof createMigratedD1>

function user(id:string){migrated.sqlite.prepare(`INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)`).run(id,id,`${id}@example.test`,1,now,now)}
function member(id:string,scope=outpost,editor=false){
  migrated.sqlite.prepare(`INSERT INTO outpost_memberships (id,auth_user_id,outpost_id,state,reason,created_at,version) VALUES (?,?,?,'verified','reviewed',?,1)`).run(`member-${id}`,id,scope,now)
  const grant=migrated.sqlite.prepare(`INSERT INTO permission_grants (id,auth_user_id,capability,scope_type,scope_id,source_membership_id,state,reason,created_at,version) VALUES (?,?,?,'outpost',?,?,'active','reviewed',?,1)`)
  grant.run(`view-${id}`,id,'view-outpost-private',scope,`member-${id}`,now)
  if(editor)grant.run(`edit-${id}`,id,'manage-outpost-calendar',scope,`member-${id}`,now)
}
const entry=(key='request-12345678')=>({title:'Service project',description:'Park cleanup',category:'service',startDate:'2026-09-10',endDate:'2026-09-10',startTime:null,endTime:null,allDay:true,location:'City park',status:'planned',requestKey:key})

beforeEach(()=>{migrated=createMigratedD1();user('viewer');user('editor');user('other');member('viewer');member('editor',outpost,true);member('other','fixture-de-rr150',true)})
afterEach(()=>migrated.close())

describe('private Outpost Workspace repository interface',()=>{
  it('allows an exact-Outpost member to read but requires the separate editor grant to configure or write',async()=>{
    expect(await getWorkspaceSummary(migrated.db,'viewer',now)).toEqual({workspace:null,canManage:false})
    await expect(setWorkspaceTimezone(migrated.db,'viewer',{timeZone:'America/Chicago',expectedVersion:null},now)).rejects.toMatchObject({status:404})
    await setWorkspaceTimezone(migrated.db,'editor',{timeZone:'America/Chicago',expectedVersion:null},now)
    await expect(createCalendarEntry(migrated.db,'viewer',entry(),now)).rejects.toMatchObject({status:404})
    expect((await getWorkspaceSummary(migrated.db,'viewer',now)).workspace).toMatchObject({timeZone:'America/Chicago',state:'active'})
  })

  it('creates, ranges, updates, and cancels a group entry with optimistic concurrency and immutable history',async()=>{
    await setWorkspaceTimezone(migrated.db,'editor',{timeZone:'America/Chicago',expectedVersion:null},now)
    const created=await createCalendarEntry(migrated.db,'editor',entry(),now) as {id:string;version:number}
    const page=await listCalendarEntries(migrated.db,'viewer',new URLSearchParams({from:'2026-09-01',to:'2026-09-30'}),now)
    expect(page.items).toHaveLength(1)
    const updated=await updateCalendarEntry(migrated.db,'editor',created.id,{...entry('edit-request-123'),title:'Updated service project'},created.version,'2026-08-13T12:01:00.000Z') as {version:number;title:string}
    expect(updated).toMatchObject({title:'Updated service project',version:2})
    await expect(updateCalendarEntry(migrated.db,'editor',created.id,entry('stale-request-123'),1,'2026-08-13T12:02:00.000Z')).rejects.toMatchObject({status:409})
    const cancelled=await cancelCalendarEntry(migrated.db,'editor',created.id,updated.version,'2026-08-13T12:03:00.000Z') as {status:string;version:number}
    expect(cancelled).toMatchObject({status:'cancelled',version:3})
    expect(migrated.sqlite.prepare(`SELECT event_type,actor_label FROM calendar_entry_events ORDER BY created_at`).all()).toEqual([
      {event_type:'created',actor_label:'Verified Outpost Editor'},{event_type:'updated',actor_label:'Verified Outpost Editor'},{event_type:'cancelled',actor_label:'Verified Outpost Editor'},
    ])
    expect(()=>migrated.sqlite.prepare(`UPDATE calendar_entry_events SET summary='changed'`).run()).toThrow('immutable')
  })

  it('fails closed for wrong-Outpost access, revoked grants, replayed create keys, invalid ranges, and archived workspaces',async()=>{
    await setWorkspaceTimezone(migrated.db,'editor',{timeZone:'America/Chicago',expectedVersion:null},now)
    const created=await createCalendarEntry(migrated.db,'editor',entry(),now) as {id:string}
    await expect(getCalendarEntry(migrated.db,'other',created.id,now)).rejects.toMatchObject({status:404})
    await expect(createCalendarEntry(migrated.db,'editor',entry(),now)).rejects.toMatchObject({status:409})
    await expect(listCalendarEntries(migrated.db,'viewer',new URLSearchParams({from:'2026-01-01',to:'2026-12-31'}),now)).rejects.toMatchObject({status:400})
    migrated.sqlite.prepare(`UPDATE outpost_workspaces SET state='read-only' WHERE outpost_id=?`).run(outpost)
    await expect(createCalendarEntry(migrated.db,'editor',entry('archived-request'),now)).rejects.toMatchObject({status:423})
    migrated.sqlite.prepare(`UPDATE permission_grants SET state='revoked',ended_at=? WHERE id='view-viewer'`).run(now)
    await expect(getWorkspaceSummary(migrated.db,'viewer',now)).rejects.toMatchObject({status:404})
  })

  it('preserves group-owned entries after editor Account deletion and exposes no actor identity',async()=>{
    await setWorkspaceTimezone(migrated.db,'editor',{timeZone:'America/Chicago',expectedVersion:null},now)
    const created=await createCalendarEntry(migrated.db,'editor',entry(),now) as {id:string}
    migrated.sqlite.prepare(`DELETE FROM "user" WHERE id='editor'`).run()
    expect(await getCalendarEntry(migrated.db,'viewer',created.id,now)).toMatchObject({title:'Service project'})
    expect(migrated.sqlite.prepare(`SELECT * FROM calendar_entry_events`).get()).not.toHaveProperty('auth_user_id')
    expect(migrated.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
})
