import { afterEach,beforeEach,describe,expect,it } from 'vitest'
import { createMigratedD1 } from './test-sqlite-d1'
import { addReferencePlan, detachReferencePlan, getReferencePlan, listReferenceReviewQueue, refreshReferencePlan, updateReferencePlanStatus } from './reference-event-plan-repository'
import { setWorkspaceTimezone } from './outpost-workspace-calendar-repository'

const now='2026-08-13T12:00:00.000Z',outpost='outpost-stx-70';let migrated:ReturnType<typeof createMigratedD1>
beforeEach(()=>{migrated=createMigratedD1();migrated.sqlite.prepare(`INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt)VALUES('editor','Editor','editor@x.test',1,?,?)`).run(now,now);migrated.sqlite.prepare(`INSERT INTO outpost_memberships(id,auth_user_id,outpost_id,state,reason,created_at,version)VALUES('m','editor',?,'verified','reviewed',?,1)`).run(outpost,now);for(const [id,cap] of [['v','view-outpost-private'],['e','manage-outpost-calendar']])migrated.sqlite.prepare(`INSERT INTO permission_grants(id,auth_user_id,capability,scope_type,scope_id,source_membership_id,state,reason,created_at,version)VALUES(?,'editor',?,'outpost',?,'m','active','reviewed',?,1)`).run(id,cap,outpost,now)})
afterEach(()=>migrated.close())

describe('private Reference Event Plan repository interface',()=>{
  it('atomically and idempotently creates one linked group plan from an exact published occurrence',async()=>{
    await setWorkspaceTimezone(migrated.db,'editor',{timeZone:'America/Chicago',expectedVersion:null},now)
    const event=migrated.sqlite.prepare(`SELECT e.content_id contentId,e.occurrence_id occurrenceId FROM event_occurrences e JOIN content_records c ON c.id=e.content_id WHERE c.status='published' LIMIT 1`).get() as {contentId:string;occurrenceId:string}
    const input={...event,status:'planning-to-attend',note:'Confirm logistics.',requestKey:'reference-request-1'}
    const first=await addReferencePlan(migrated.db,'editor',input,now),second=await addReferencePlan(migrated.db,'editor',input,now)
    expect(second.id).toBe(first.id);expect(migrated.sqlite.prepare('SELECT count(*) count FROM reference_event_plans').get()).toEqual({count:1});expect(migrated.sqlite.prepare('SELECT count(*) count FROM outpost_calendar_entries').get()).toEqual({count:1})
  })

  it('reports material public changes without rewriting the private entry and refreshes only by explicit optimistic action',async()=>{
    await setWorkspaceTimezone(migrated.db,'editor',{timeZone:'America/Chicago',expectedVersion:null},now)
    const event=migrated.sqlite.prepare(`SELECT e.content_id contentId,e.occurrence_id occurrenceId,e.start_date startDate FROM event_occurrences e JOIN content_records c ON c.id=e.content_id WHERE c.status='published' LIMIT 1`).get() as {contentId:string;occurrenceId:string;startDate:string}
    const plan=await addReferencePlan(migrated.db,'editor',{contentId:event.contentId,occurrenceId:event.occurrenceId,status:'considering',note:null,requestKey:'reference-request-2'},now)
    migrated.sqlite.prepare(`UPDATE event_occurrences SET start_date='2026-12-24' WHERE content_id=?`).run(event.contentId);migrated.sqlite.prepare(`UPDATE content_records SET version=version+1,updated_at='2026-08-14T00:00:00Z' WHERE id=?`).run(event.contentId)
    const changed=await getReferencePlan(migrated.db,'editor',String(plan.id),now)
    expect(changed).toMatchObject({reviewState:'review-required',reviewReason:'schedule-changed'});expect(migrated.sqlite.prepare('SELECT start_date FROM outpost_calendar_entries').get()).toEqual({start_date:event.startDate})
    const refreshed=await refreshReferencePlan(migrated.db,'editor',String(plan.id),changed.version,'2026-08-14T01:00:00Z');expect(refreshed).toMatchObject({reviewState:'current',snapshot:{startDate:'2026-12-24'}})
  })

  it('rejects stale status writes and bounds the exact-Outpost review queue',async()=>{
    await setWorkspaceTimezone(migrated.db,'editor',{timeZone:'America/Chicago',expectedVersion:null},now)
    const event=migrated.sqlite.prepare(`SELECT e.content_id contentId,e.occurrence_id occurrenceId FROM event_occurrences e JOIN content_records c ON c.id=e.content_id WHERE c.status='published' LIMIT 1`).get() as {contentId:string;occurrenceId:string}
    const plan=await addReferencePlan(migrated.db,'editor',{...event,status:'considering',note:null,requestKey:'reference-request-3'},now)
    await updateReferencePlanStatus(migrated.db,'editor',String(plan.id),'planning-to-attend',plan.version,now)
    await expect(updateReferencePlanStatus(migrated.db,'editor',String(plan.id),'confirmed-by-outpost',plan.version,now)).rejects.toMatchObject({status:409})
    await expect(listReferenceReviewQueue(migrated.db,'editor',101,now)).rejects.toMatchObject({status:400})
  })

  it('allows a detached occurrence to become a new active plan while preserving history',async()=>{
    await setWorkspaceTimezone(migrated.db,'editor',{timeZone:'America/Chicago',expectedVersion:null},now)
    const event=migrated.sqlite.prepare(`SELECT e.content_id contentId,e.occurrence_id occurrenceId FROM event_occurrences e JOIN content_records c ON c.id=e.content_id WHERE c.status='published' LIMIT 1`).get() as {contentId:string;occurrenceId:string}
    const first=await addReferencePlan(migrated.db,'editor',{...event,status:'considering',note:null,requestKey:'reference-detach-1'},now)
    await detachReferencePlan(migrated.db,'editor',String(first.id),first.version,true,now)
    const second=await addReferencePlan(migrated.db,'editor',{...event,status:'planning-to-attend',note:null,requestKey:'reference-detach-2'},now)
    expect(second.id).not.toBe(first.id)
    expect(migrated.sqlite.prepare('SELECT count(*) count FROM reference_event_plans').get()).toEqual({count:2})
  })
})
