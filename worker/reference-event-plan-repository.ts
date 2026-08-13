import { classifyReferenceEventChange, validateReferencePlanInput, referencePlanStatuses, type ReferenceEventFacts } from '../shared/reference-event-plan'
import { WorkspaceCalendarError, activeWorkspace, requireWorkspaceEditor, workspaceAccess } from './outpost-workspace-calendar-repository'

const requiredConflictFields=['title','summary','occurrenceId','category','host','scope','startDate','timeZone','allDay','lifecycleStatus','officialUrl']

type EventRow={title:string;status:string;version:number;updatedAt:string;occurrenceId:string;startDate:string;endDate:string|null;startTime:string|null;endTime:string|null;allDay:number;timeZone:string;location:string|null;locationStatus:string;host:string;scope:string;lifecycleStatus:string;registrationStatus:string;registrationDeadline:string|null;registrationUrl:string|null;officialUrl:string;requiredFactConflict:number}

async function eventFacts(db:D1Database,contentId:string,occurrenceId:string):Promise<ReferenceEventFacts|null>{
  const placeholders=requiredConflictFields.map(()=>'?').join(',')
  const row=await db.prepare(`SELECT content.title,content.status,content.version,content.updated_at updatedAt,event.occurrence_id occurrenceId,
    event.start_date startDate,event.end_date endDate,event.start_time startTime,event.end_time endTime,event.all_day allDay,event.time_zone timeZone,
    event.location,event.location_status locationStatus,event.host,event.scope,event.lifecycle_status lifecycleStatus,event.registration_status registrationStatus,
    event.registration_deadline registrationDeadline,event.registration_url registrationUrl,event.official_url officialUrl,
    EXISTS(SELECT 1 FROM normalized_event_conflicts conflict WHERE conflict.occurrence_id=event.content_id AND conflict.status='open' AND conflict.field_path IN (${placeholders})) requiredFactConflict
    FROM content_records content JOIN event_occurrences event ON event.content_id=content.id
    WHERE content.id=? AND event.occurrence_id=? AND content.kind='event'`).bind(...requiredConflictFields,contentId,occurrenceId).first<EventRow>()
  if(!row)return null
  return {title:row.title,startDate:row.startDate,endDate:row.endDate,startTime:row.startTime,endTime:row.endTime,allDay:row.allDay===1,timeZone:row.timeZone,
    location:row.location,locationStatus:row.locationStatus,host:row.host,scope:row.scope,lifecycleStatus:row.lifecycleStatus,registrationStatus:row.registrationStatus,
    registrationDeadline:row.registrationDeadline,registrationUrl:row.registrationUrl,officialUrl:row.officialUrl,requiredFactConflict:row.requiredFactConflict===1,
    published:row.status==='published',referenceVersion:row.version,checkedAt:row.updatedAt}
}

function snapshot(row:Record<string,unknown>):ReferenceEventFacts{
  return {title:String(row.snapshotTitle),startDate:String(row.snapshotStartDate),endDate:row.snapshotEndDate as string|null,startTime:row.snapshotStartTime as string|null,endTime:row.snapshotEndTime as string|null,
    allDay:Number(row.snapshotAllDay)===1,timeZone:String(row.snapshotTimeZone),location:row.snapshotLocation as string|null,locationStatus:String(row.snapshotLocationStatus),host:String(row.snapshotHost),scope:String(row.snapshotScope),
    lifecycleStatus:String(row.snapshotLifecycleStatus),registrationStatus:String(row.snapshotRegistrationStatus),registrationDeadline:row.snapshotRegistrationDeadline as string|null,registrationUrl:row.snapshotRegistrationUrl as string|null,
    officialUrl:String(row.snapshotOfficialUrl),requiredFactConflict:Number(row.snapshotRequiredConflict)===1,published:true,referenceVersion:Number(row.referenceVersion),checkedAt:String(row.referenceCheckedAt)}
}

const planSelect=`SELECT plan.id,plan.calendar_entry_id calendarEntryId,plan.reference_content_id referenceContentId,plan.occurrence_id occurrenceId,
  plan.plan_status status,plan.private_note note,plan.review_state reviewState,plan.review_reason_code reviewReason,plan.reference_version referenceVersion,
  plan.reference_checked_at referenceCheckedAt,plan.snapshot_title snapshotTitle,plan.snapshot_start_date snapshotStartDate,plan.snapshot_end_date snapshotEndDate,
  plan.snapshot_start_time snapshotStartTime,plan.snapshot_end_time snapshotEndTime,plan.snapshot_all_day snapshotAllDay,plan.snapshot_time_zone snapshotTimeZone,
  plan.snapshot_location snapshotLocation,plan.snapshot_location_status snapshotLocationStatus,plan.snapshot_host snapshotHost,plan.snapshot_scope snapshotScope,
  plan.snapshot_lifecycle_status snapshotLifecycleStatus,plan.snapshot_registration_status snapshotRegistrationStatus,
  plan.snapshot_registration_deadline snapshotRegistrationDeadline,plan.snapshot_registration_url snapshotRegistrationUrl,plan.snapshot_official_url snapshotOfficialUrl,
  plan.snapshot_required_conflict snapshotRequiredConflict,plan.created_at createdAt,plan.updated_at updatedAt,plan.reviewed_at reviewedAt,plan.detached_at detachedAt,plan.version`

async function planById(db:D1Database,outpostId:string,planId:string){return db.prepare(`${planSelect} FROM reference_event_plans plan WHERE plan.id=? AND plan.outpost_id=?`).bind(planId,outpostId).first<Record<string,unknown>>()}

async function markReviewIfNeeded(db:D1Database,outpostId:string,plan:Record<string,unknown>,current:ReferenceEventFacts|null,now:string){
  const reasons=current?classifyReferenceEventChange(snapshot(plan),current):['event-unpublished'] as const
  if(!reasons.length||plan.reviewState==='review-required')return plan
  const mutationId=crypto.randomUUID(),reason=reasons[0]
  await db.batch([
    db.prepare(`UPDATE reference_event_plans SET review_state='review-required',review_reason_code=?,updated_at=?,last_mutation_id=?,version=version+1 WHERE id=? AND outpost_id=? AND version=? AND review_state='current'`).bind(reason,now,mutationId,plan.id,outpostId,plan.version),
    db.prepare(`INSERT INTO reference_event_plan_events(id,plan_id,outpost_id,event_type,actor_label,summary,plan_version,created_at)
      SELECT ?,id,outpost_id,'review-flagged','Service Operator','Material public event change requires Outpost review.',version,? FROM reference_event_plans WHERE id=? AND outpost_id=? AND last_mutation_id=?`).bind(mutationId,now,plan.id,outpostId,mutationId),
  ])
  return (await planById(db,outpostId,String(plan.id)))??plan
}

export async function getReferenceEligibility(db:D1Database,authUserId:string,contentId:string,occurrenceId:string,now:string){
  const allowed=await workspaceAccess(db,authUserId,now)
  const facts=await eventFacts(db,contentId,occurrenceId)
  if(!facts||!facts.published) throw new WorkspaceCalendarError('Reference occurrence unavailable.',404)
  let plan=await db.prepare(`${planSelect} FROM reference_event_plans plan WHERE plan.outpost_id=? AND plan.reference_content_id=? AND plan.occurrence_id=? AND plan.detached_at IS NULL`).bind(allowed.outpostId,contentId,occurrenceId).first<Record<string,unknown>>()
  if(!plan&&facts.requiredFactConflict) throw new WorkspaceCalendarError('Reference occurrence unavailable.',404)
  if(plan)plan=await markReviewIfNeeded(db,allowed.outpostId,plan,facts,now)
  return {canManage:allowed.canManage,plan:plan?publicPlan(plan,facts):null}
}

function publicPlan(plan:Record<string,unknown>,current:ReferenceEventFacts|null){
  const saved=snapshot(plan), reasons=current?classifyReferenceEventChange(saved,current):['event-unpublished']
  return {...plan,snapshot:saved,current,reasons,reviewState:reasons.length?'review-required':plan.reviewState,reviewReason:reasons[0]??plan.reviewReason}
}

export async function addReferencePlan(db:D1Database,authUserId:string,value:unknown,now:string){
  const allowed=await requireWorkspaceEditor(db,authUserId,now);const workspace=await activeWorkspace(db,allowed.outpostId)
  if(!value||typeof value!=='object'||Array.isArray(value))throw new WorkspaceCalendarError('Reference plan must be an object.',400)
  const raw=value as Record<string,unknown>;const permitted=new Set(['contentId','occurrenceId','status','note','requestKey'])
  if(Object.keys(raw).some(key=>!permitted.has(key)))throw new WorkspaceCalendarError('Reference plan contains an unsupported field.',400)
  if(typeof raw.contentId!=='string'||typeof raw.occurrenceId!=='string')throw new WorkspaceCalendarError('Reference occurrence unavailable.',404)
  const input=validateReferencePlanInput({status:raw.status,note:raw.note,requestKey:raw.requestKey})
  const existing=await db.prepare(`${planSelect} FROM reference_event_plans plan WHERE plan.outpost_id=? AND plan.reference_content_id=? AND plan.occurrence_id=? AND plan.detached_at IS NULL`).bind(allowed.outpostId,raw.contentId,raw.occurrenceId).first<Record<string,unknown>>()
  if(existing)return publicPlan(existing,await eventFacts(db,raw.contentId,raw.occurrenceId))
  const facts=await eventFacts(db,raw.contentId,raw.occurrenceId)
  if(!facts||!facts.published||facts.requiredFactConflict)throw new WorkspaceCalendarError('Reference occurrence unavailable.',404)
  const entryId=crypto.randomUUID(),planId=crypto.randomUUID(),entryStatus=input.status==='considering'?'tentative':input.status==='planning-to-attend'?'planned':'confirmed'
  const statements=[
    db.prepare(`INSERT INTO outpost_calendar_entries(id,outpost_id,request_key,title,description,category,start_date,end_date,start_time,end_time,all_day,time_zone,location,status,created_at,updated_at,version)
      VALUES(?,?,?,?,NULL,'other',?,?,?,?,?,?,?,?,?,?,1)`).bind(entryId,allowed.outpostId,input.requestKey,facts.title,facts.startDate,facts.endDate??facts.startDate,facts.startTime,facts.endTime,facts.allDay?1:0,workspace.timeZone,facts.location,entryStatus,now,now),
    db.prepare(`INSERT INTO reference_event_plans(id,calendar_entry_id,outpost_id,reference_content_id,occurrence_id,request_key,reference_version,reference_checked_at,plan_status,private_note,
      snapshot_title,snapshot_start_date,snapshot_end_date,snapshot_start_time,snapshot_end_time,snapshot_all_day,snapshot_time_zone,snapshot_location,snapshot_location_status,snapshot_host,snapshot_scope,
      snapshot_lifecycle_status,snapshot_registration_status,snapshot_registration_deadline,snapshot_registration_url,snapshot_official_url,snapshot_required_conflict,review_state,review_reason_code,created_at,updated_at,version)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'current',NULL,?,?,1)`).bind(planId,entryId,allowed.outpostId,raw.contentId,raw.occurrenceId,input.requestKey,facts.referenceVersion,facts.checkedAt,input.status,input.note,
        facts.title,facts.startDate,facts.endDate,facts.startTime,facts.endTime,facts.allDay?1:0,facts.timeZone,facts.location,facts.locationStatus,facts.host,facts.scope,facts.lifecycleStatus,facts.registrationStatus,facts.registrationDeadline,facts.registrationUrl,facts.officialUrl,facts.requiredFactConflict?1:0,now,now),
    db.prepare(`INSERT INTO calendar_entry_events(id,entry_id,outpost_id,event_type,actor_label,summary,entry_version,created_at) VALUES(?,?,?,'created','Verified Outpost Editor','Group calendar entry created from Reference Calendar.',1,?)`).bind(crypto.randomUUID(),entryId,allowed.outpostId,now),
    db.prepare(`INSERT INTO reference_event_plan_events(id,plan_id,outpost_id,event_type,actor_label,summary,plan_version,created_at) VALUES(?,?,?,'created','Verified Outpost Editor','Reference occurrence added as an Outpost plan.',1,?)`).bind(crypto.randomUUID(),planId,allowed.outpostId,now),
  ]
  try{await db.batch(statements)}catch{
    const replay=await db.prepare(`${planSelect} FROM reference_event_plans plan WHERE plan.outpost_id=? AND plan.reference_content_id=? AND plan.occurrence_id=? AND plan.detached_at IS NULL`).bind(allowed.outpostId,raw.contentId,raw.occurrenceId).first<Record<string,unknown>>()
    if(replay)return publicPlan(replay,await eventFacts(db,raw.contentId,raw.occurrenceId))
    throw new WorkspaceCalendarError('Reference plan could not be saved.',409)
  }
  const saved=await planById(db,allowed.outpostId,planId);return publicPlan(saved!,facts)
}

export async function getReferencePlan(db:D1Database,authUserId:string,planId:string,now:string){const allowed=await workspaceAccess(db,authUserId,now);let plan=await planById(db,allowed.outpostId,planId);if(!plan)throw new WorkspaceCalendarError('Reference plan unavailable.',404);const current=await eventFacts(db,String(plan.referenceContentId),String(plan.occurrenceId));plan=await markReviewIfNeeded(db,allowed.outpostId,plan,current,now);return publicPlan(plan,current)}

export async function updateReferencePlanStatus(db:D1Database,authUserId:string,planId:string,status:unknown,expectedVersion:unknown,now:string){
  const allowed=await requireWorkspaceEditor(db,authUserId,now);await activeWorkspace(db,allowed.outpostId)
  if(!referencePlanStatuses.includes(status as never)||!Number.isInteger(expectedVersion))throw new WorkspaceCalendarError('Reference plan changed.',409)
  const eventId=crypto.randomUUID();await db.batch([
    db.prepare(`UPDATE reference_event_plans SET plan_status=?,updated_at=?,last_mutation_id=?,version=version+1 WHERE id=? AND outpost_id=? AND detached_at IS NULL AND version=?`).bind(status,now,eventId,planId,allowed.outpostId,expectedVersion),
    db.prepare(`INSERT INTO reference_event_plan_events(id,plan_id,outpost_id,event_type,actor_label,summary,plan_version,created_at)
      SELECT ?,id,outpost_id,'status-changed','Verified Outpost Editor','Outpost plan status changed.',version,? FROM reference_event_plans WHERE id=? AND outpost_id=? AND last_mutation_id=?`).bind(eventId,now,planId,allowed.outpostId,eventId),
  ]);if(!await db.prepare('SELECT id FROM reference_event_plan_events WHERE id=?').bind(eventId).first())throw new WorkspaceCalendarError('Reference plan changed.',409)
  return getReferencePlan(db,authUserId,planId,now)
}

export async function refreshReferencePlan(db:D1Database,authUserId:string,planId:string,expectedVersion:unknown,now:string){
  const allowed=await requireWorkspaceEditor(db,authUserId,now);await activeWorkspace(db,allowed.outpostId);const plan=await planById(db,allowed.outpostId,planId)
  if(!plan||!Number.isInteger(expectedVersion)||plan.version!==expectedVersion)throw new WorkspaceCalendarError('Reference plan changed.',409)
  const facts=await eventFacts(db,String(plan.referenceContentId),String(plan.occurrenceId));if(!facts||!facts.published||facts.requiredFactConflict)throw new WorkspaceCalendarError('Current public facts require review and cannot be accepted.',409)
  const eventId=crypto.randomUUID();await db.batch([
    db.prepare(`UPDATE reference_event_plans SET reference_version=?,reference_checked_at=?,snapshot_title=?,snapshot_start_date=?,snapshot_end_date=?,snapshot_start_time=?,snapshot_end_time=?,snapshot_all_day=?,snapshot_time_zone=?,snapshot_location=?,snapshot_location_status=?,snapshot_host=?,snapshot_scope=?,snapshot_lifecycle_status=?,snapshot_registration_status=?,snapshot_registration_deadline=?,snapshot_registration_url=?,snapshot_official_url=?,snapshot_required_conflict=?,review_state='current',review_reason_code=NULL,reviewed_at=?,updated_at=?,last_mutation_id=?,version=version+1 WHERE id=? AND outpost_id=? AND version=?`).bind(facts.referenceVersion,facts.checkedAt,facts.title,facts.startDate,facts.endDate,facts.startTime,facts.endTime,facts.allDay?1:0,facts.timeZone,facts.location,facts.locationStatus,facts.host,facts.scope,facts.lifecycleStatus,facts.registrationStatus,facts.registrationDeadline,facts.registrationUrl,facts.officialUrl,facts.requiredFactConflict?1:0,now,now,eventId,planId,allowed.outpostId,expectedVersion),
    db.prepare(`INSERT INTO reference_event_plan_events(id,plan_id,outpost_id,event_type,actor_label,summary,plan_version,created_at) SELECT ?,id,outpost_id,'snapshot-refreshed','Verified Outpost Editor','Current public facts accepted; local calendar dates were not changed.',version,? FROM reference_event_plans WHERE id=? AND outpost_id=? AND last_mutation_id=?`).bind(eventId,now,planId,allowed.outpostId,eventId),
  ]);if(!await db.prepare('SELECT id FROM reference_event_plan_events WHERE id=?').bind(eventId).first())throw new WorkspaceCalendarError('Reference plan changed.',409);return getReferencePlan(db,authUserId,planId,now)
}

export async function detachReferencePlan(db:D1Database,authUserId:string,planId:string,expectedVersion:unknown,keepEntry:boolean,now:string){
  const allowed=await requireWorkspaceEditor(db,authUserId,now);await activeWorkspace(db,allowed.outpostId);const plan=await planById(db,allowed.outpostId,planId)
  if(!plan||!Number.isInteger(expectedVersion)||plan.version!==expectedVersion||plan.detachedAt)throw new WorkspaceCalendarError('Reference plan changed.',409)
  const nextStatus=keepEntry?'no-longer-attending':'cancelled',eventId=crypto.randomUUID(),statements=[
    db.prepare(`UPDATE reference_event_plans SET plan_status=?,detached_at=?,updated_at=?,last_mutation_id=?,version=version+1 WHERE id=? AND outpost_id=? AND version=?`).bind(nextStatus,now,now,eventId,planId,allowed.outpostId,expectedVersion),
    db.prepare(`INSERT INTO reference_event_plan_events(id,plan_id,outpost_id,event_type,actor_label,summary,plan_version,created_at) SELECT ?,id,outpost_id,'detached','Verified Outpost Editor',?,version,? FROM reference_event_plans WHERE id=? AND outpost_id=? AND last_mutation_id=?`).bind(eventId,keepEntry?'Reference relationship detached; group entry retained.':'Reference relationship detached; group entry cancelled.',now,planId,allowed.outpostId,eventId),
  ];if(!keepEntry)statements.push(db.prepare(`UPDATE outpost_calendar_entries SET status='cancelled',cancelled_at=?,updated_at=?,version=version+1 WHERE id=? AND outpost_id=? AND status<>'cancelled' AND EXISTS(SELECT 1 FROM reference_event_plans plan WHERE plan.id=? AND plan.outpost_id=? AND plan.last_mutation_id=?)`).bind(now,now,plan.calendarEntryId,allowed.outpostId,planId,allowed.outpostId,eventId))
  await db.batch(statements);if(!await db.prepare('SELECT id FROM reference_event_plan_events WHERE id=?').bind(eventId).first())throw new WorkspaceCalendarError('Reference plan changed.',409);return getReferencePlan(db,authUserId,planId,now)
}

export async function listReferenceReviewQueue(db:D1Database,authUserId:string,limitValue:unknown,now:string){
  const allowed=await workspaceAccess(db,authUserId,now),limit=Number(limitValue??50);if(!Number.isInteger(limit)||limit<1||limit>100)throw new WorkspaceCalendarError('Review queue page size is invalid.',400)
  const {results}=await db.prepare(`${planSelect} FROM reference_event_plans plan WHERE plan.outpost_id=? AND plan.detached_at IS NULL ORDER BY plan.updated_at,plan.id LIMIT ?`).bind(allowed.outpostId,limit).all<Record<string,unknown>>()
  const compared=[];for(let plan of results){const current=await eventFacts(db,String(plan.referenceContentId),String(plan.occurrenceId));plan=await markReviewIfNeeded(db,allowed.outpostId,plan,current,now);const value=publicPlan(plan,current);if(value.reviewState==='review-required')compared.push(value)}return {items:compared,hasMore:results.length===limit}
}
