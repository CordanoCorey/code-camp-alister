import { describe, expect, it } from 'vitest'
import { classifyReferenceEventChange, validateReferencePlanInput, type ReferenceEventFacts } from './reference-event-plan'

const facts: ReferenceEventFacts = {
  title:'District Camp',startDate:'2026-09-10',endDate:'2026-09-12',startTime:null,endTime:null,allDay:true,
  timeZone:'America/Chicago',location:'Camp Ground',locationStatus:'announced',host:'District',scope:'district',
  lifecycleStatus:'confirmed',registrationStatus:'open',registrationDeadline:'2026-08-20',registrationUrl:'https://example.test/register',
  officialUrl:'https://example.test/event',requiredFactConflict:false,published:true,referenceVersion:3,checkedAt:'2026-08-13T12:00:00.000Z',
}

describe('Reference Event Plan domain interface',()=>{
  it('flags material schedule, lifecycle, registration, conflict, and publication changes',()=>{
    expect(classifyReferenceEventChange(facts,{...facts,startDate:'2026-09-11'})).toContain('schedule-changed')
    expect(classifyReferenceEventChange(facts,{...facts,lifecycleStatus:'cancelled'})).toContain('lifecycle-changed')
    expect(classifyReferenceEventChange(facts,{...facts,registrationUrl:null})).toContain('registration-changed')
    expect(classifyReferenceEventChange(facts,{...facts,requiredFactConflict:true})).toContain('required-fact-conflict-opened')
    expect(classifyReferenceEventChange(facts,{...facts,published:false})).toContain('event-unpublished')
  })

  it('does not create review work for version/check-time-only edits',()=>{
    expect(classifyReferenceEventChange(facts,{...facts,referenceVersion:4,checkedAt:'2026-08-14T12:00:00.000Z'})).toEqual([])
  })

  it('accepts bounded private plan input and rejects unsafe notes and unknown fields',()=>{
    expect(validateReferencePlanInput({status:'planning-to-attend',note:'Confirm adult drivers only.',requestKey:'reference-1234'})).toMatchObject({status:'planning-to-attend'})
    expect(()=>validateReferencePlanInput({status:'planning-to-attend',note:'name\u0000',requestKey:'reference-1234'})).toThrow('control')
    expect(()=>validateReferencePlanInput({status:'planning-to-attend',note:null,requestKey:'reference-1234',attendees:4})).toThrow('unsupported')
  })
})
