import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { handleOrdinaryAccount } from './ordinary-account-http'
import { handleOrdinaryAuth, type OrdinaryAuthEnv } from './ordinary-auth'
import { handleOutpostWorkspaceCalendar } from './outpost-workspace-calendar-http'
import { createMigratedD1 } from './test-sqlite-d1'

const origin='http://localhost:5173', now='2026-08-13T12:00:00.000Z', outpost='outpost-stx-70'
const credentials={email:'calendar@example.test',password:'correct horse battery staple'}
const request=(path:string,method='GET',body?:unknown,cookie='')=>new Request(`${origin}${path}`,{method,headers:{...(body?{'content-type':'application/json',origin}:{}),...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})})
const cookieFrom=(response:Response)=>response.headers.get('set-cookie')?.split(';',1)[0]??''

describe('private Outpost Workspace HTTP interface',()=>{
  let migrated:ReturnType<typeof createMigratedD1>,env:OrdinaryAuthEnv,cookie:string,userId:string
  beforeEach(async()=>{
    migrated=createMigratedD1();env={DB:migrated.db,AUTH_SECRET:'test-only-auth-secret-that-is-at-least-32-characters',LOCAL_AUTH_EMAIL_PREVIEW:'true'}
    const eligibility=await handleOrdinaryAccount(request('/api/account/eligibility','POST',{birthYear:'2000',attested:true}),env)
    const {token}=await eligibility.json() as {token:string}
    await handleOrdinaryAuth(request('/api/auth/sign-up/email','POST',{...credentials,eligibilityToken:token,profile:{displayName:'Calendar Adult',onboardingPath:'usa',claimedPosition:'Adult Leader',claimedPositionOther:null,currentOutpostId:outpost,outpostClaim:null,usaJurisdictionId:'us-tx',countryCode:null,internationalSubdivision:null}}),env,'signup')
    const preview=await handleOrdinaryAccount(request('/api/account/local-email-preview?purpose=verification'),env),{url}=await preview.json() as {url:string}
    await handleOrdinaryAuth(new Request(url,{redirect:'manual'}),env,'verify')
    const signIn=await handleOrdinaryAuth(request('/api/auth/sign-in/email','POST',credentials),env,'signin');cookie=cookieFrom(signIn)
    userId=(migrated.sqlite.prepare(`SELECT id FROM "user" WHERE email=?`).get(credentials.email) as {id:string}).id
    migrated.sqlite.prepare(`INSERT INTO outpost_memberships (id,auth_user_id,outpost_id,state,reason,created_at,version) VALUES ('calendar-member',?,?,'verified','reviewed',?,1)`).run(userId,outpost,now)
    migrated.sqlite.prepare(`INSERT INTO permission_grants (id,auth_user_id,capability,scope_type,scope_id,source_membership_id,state,reason,created_at,version) VALUES ('calendar-view',?,'view-outpost-private','outpost',?,'calendar-member','active','reviewed',?,1)`).run(userId,outpost,now)
  },30_000)
  afterEach(()=>migrated.close())

  it('returns non-enumerating no-store failures and reevaluates revocation on the next request',async()=>{
    const anonymous=await handleOutpostWorkspaceCalendar(request('/api/workspace'),env)
    expect(anonymous.status).toBe(404);expect(anonymous.headers.get('cache-control')).toBe('private, no-store')
    const member=await handleOutpostWorkspaceCalendar(request('/api/workspace','GET',undefined,cookie),env)
    expect(member.status).toBe(200);expect(await member.json()).toEqual({workspace:null,canManage:false})
    const forbiddenWrite=await handleOutpostWorkspaceCalendar(request('/api/workspace/timezone','PUT',{timeZone:'America/Chicago',expectedVersion:null},cookie),env)
    expect(forbiddenWrite.status).toBe(404)
    migrated.sqlite.prepare(`UPDATE permission_grants SET state='revoked',ended_at=? WHERE id='calendar-view'`).run(now)
    expect((await handleOutpostWorkspaceCalendar(request('/api/workspace','GET',undefined,cookie),env)).status).toBe(404)
  },30_000)

  it('lets an exact-scope editor configure and create but rejects forged fields and stale versions',async()=>{
    migrated.sqlite.prepare(`INSERT INTO permission_grants (id,auth_user_id,capability,scope_type,scope_id,source_membership_id,state,reason,created_at,version) VALUES ('calendar-edit',?,'manage-outpost-calendar','outpost',?,'calendar-member','active','reviewed',?,1)`).run(userId,outpost,now)
    expect((await handleOutpostWorkspaceCalendar(request('/api/workspace/timezone','PUT',{timeZone:'America/Chicago',expectedVersion:null},cookie),env)).status).toBe(200)
    const entry={title:'Meeting',description:null,category:'meeting',startDate:'2026-09-10',endDate:'2026-09-10',startTime:null,endTime:null,allDay:true,location:null,status:'planned',requestKey:'http-request-123'}
    const created=await handleOutpostWorkspaceCalendar(request('/api/workspace/calendar','POST',entry,cookie),env)
    expect(created.status).toBe(201);expect(created.headers.get('pragma')).toBe('no-cache')
    expect((await handleOutpostWorkspaceCalendar(request('/api/workspace/calendar','POST',{...entry,attendees:['Youth']},cookie),env)).status).toBe(400)
    const {entry:saved}=await created.json() as {entry:{id:string;version:number}}
    expect((await handleOutpostWorkspaceCalendar(request(`/api/workspace/calendar/${saved.id}`,'PUT',{entry:{...entry,requestKey:'http-edit-123'},expectedVersion:99},cookie),env)).status).toBe(409)
  },30_000)
})
