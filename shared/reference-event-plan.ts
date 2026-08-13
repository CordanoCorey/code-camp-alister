export const referencePlanStatuses=['considering','planning-to-attend','confirmed-by-outpost','no-longer-attending','cancelled'] as const
export type ReferencePlanStatus=(typeof referencePlanStatuses)[number]
export const planReviewReasons=['schedule-changed','timezone-changed','lifecycle-changed','location-changed','registration-changed','required-fact-conflict-opened','required-fact-conflict-closed','event-unpublished'] as const
export type PlanReviewReason=(typeof planReviewReasons)[number]

export type ReferenceEventFacts={
  title:string;startDate:string;endDate:string|null;startTime:string|null;endTime:string|null;allDay:boolean;timeZone:string
  location:string|null;locationStatus:string;host:string;scope:string;lifecycleStatus:string;registrationStatus:string
  registrationDeadline:string|null;registrationUrl:string|null;officialUrl:string;requiredFactConflict:boolean;published:boolean
  referenceVersion:number;checkedAt:string
}

export function classifyReferenceEventChange(previous:ReferenceEventFacts,current:ReferenceEventFacts):PlanReviewReason[]{
  const reasons:PlanReviewReason[]=[]
  if(!current.published) reasons.push('event-unpublished')
  if(previous.startDate!==current.startDate||previous.endDate!==current.endDate||previous.startTime!==current.startTime||previous.endTime!==current.endTime||previous.allDay!==current.allDay) reasons.push('schedule-changed')
  if(previous.timeZone!==current.timeZone) reasons.push('timezone-changed')
  if(previous.lifecycleStatus!==current.lifecycleStatus) reasons.push('lifecycle-changed')
  if(previous.location!==current.location||previous.locationStatus!==current.locationStatus) reasons.push('location-changed')
  if(previous.registrationStatus!==current.registrationStatus||previous.registrationDeadline!==current.registrationDeadline||previous.registrationUrl!==current.registrationUrl) reasons.push('registration-changed')
  if(!previous.requiredFactConflict&&current.requiredFactConflict) reasons.push('required-fact-conflict-opened')
  if(previous.requiredFactConflict&&!current.requiredFactConflict) reasons.push('required-fact-conflict-closed')
  return reasons
}

export function validateReferencePlanInput(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('Reference plan must be an object.')
  const input=value as Record<string,unknown>, allowed=new Set(['status','note','requestKey'])
  if(Object.keys(input).some(key=>!allowed.has(key))) throw new Error('Reference plan contains an unsupported field.')
  if(!referencePlanStatuses.slice(0,3).includes(input.status as never)) throw new Error('Choose an active Outpost plan status.')
  if(typeof input.requestKey!=='string'||input.requestKey.length<8||input.requestKey.length>100) throw new Error('Request key is invalid.')
  if(input.note!==null&&input.note!==undefined&&typeof input.note!=='string') throw new Error('Private note must be text.')
  const note=typeof input.note==='string'?input.note.trim():null
  if(note&&[...note].some(character=>{const code=character.charCodeAt(0);return code<32||code===127})) throw new Error('Private note cannot contain control characters.')
  if(note&&note.length>300) throw new Error('Private note must be at most 300 characters.')
  return {status:input.status as ReferencePlanStatus,note:note||null,requestKey:input.requestKey}
}
