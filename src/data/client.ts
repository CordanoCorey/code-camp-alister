import type { ContentRecord, CursorPage, DirectorySubmissionDetail, DirectorySubmissionState, DirectorySubmissionSummary, MaintenanceWorkspace, OperatorSession, OperatorSnapshot, PublicBootstrap, StagedOutpostCandidate } from '../../shared/domain'
import type { OrdinaryAccountProfile, ValidatedOrdinaryProfile } from '../../shared/account'

type ErrorPayload = { error?: string }

const bootstrapRetryDelayMs = 250

async function requestJson<T>(path: string, init?: RequestInit, fallbackMessage = 'The requested information could not be loaded.') {
  const response = await fetch(path, init)
  const data = await response.json() as T & ErrorPayload
  if (!response.ok) throw new Error(data.error || fallbackMessage)
  return { data, fromCache: response.headers.get('x-ranger-data-source') === 'cache' }
}

export type WorkspaceSummary = { workspace: null | { outpostId: string; timeZone: string; state: 'active'|'read-only'; version: number }; canManage: boolean }
export type WorkspaceCalendarEntry = { id:string; title:string; description:string|null; category:string; startDate:string; endDate:string; startTime:string|null; endTime:string|null; allDay:number; timeZone:string; location:string|null; status:string; version:number; referencePlanId?:string|null;referenceContentId?:string|null;referencePlanStatus?:string|null;referenceReviewState?:string|null;referenceReviewReason?:string|null;referenceCheckedAt?:string|null;referenceLifecycleStatus?:string|null;referenceOfficialUrl?:string|null;referencePlanVersion?:number|null }
export type ReferencePlan={id:string;calendarEntryId:string;referenceContentId:string;occurrenceId:string;status:string;note:string|null;reviewState:'current'|'review-required';reviewReason:string|null;referenceCheckedAt:string;version:number;snapshot:{title:string;startDate:string;lifecycleStatus:string;officialUrl:string};current:Record<string,unknown>|null;reasons:string[];detachedAt:string|null}
const workspaceMutation = <T>(path:string, method:string, body:unknown) => requestJson<T>(path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)})
export const fetchWorkspace = () => requestJson<WorkspaceSummary>('/api/workspace')
export const setWorkspaceTimezone = (timeZone:string, expectedVersion:number|null) => workspaceMutation<WorkspaceSummary>('/api/workspace/timezone','PUT',{timeZone,expectedVersion})
export const fetchWorkspaceCalendar = (from:string,to:string) => requestJson<{items:WorkspaceCalendarEntry[];hasMore:boolean}>(`/api/workspace/calendar?from=${from}&to=${to}&limit=100`)
export const createWorkspaceCalendarEntry = (entry:unknown) => workspaceMutation<{entry:WorkspaceCalendarEntry}>('/api/workspace/calendar','POST',entry)
export const updateWorkspaceCalendarEntry = (id:string,entry:unknown,expectedVersion:number) => workspaceMutation<{entry:WorkspaceCalendarEntry}>(`/api/workspace/calendar/${encodeURIComponent(id)}`,'PUT',{entry,expectedVersion})
export const cancelWorkspaceCalendarEntry = (id:string,expectedVersion:number) => workspaceMutation<{entry:WorkspaceCalendarEntry}>(`/api/workspace/calendar/${encodeURIComponent(id)}/cancel`,'POST',{expectedVersion})
export const fetchReferenceEligibility=(contentId:string,occurrenceId:string)=>requestJson<{canManage:boolean;plan:ReferencePlan|null}>(`/api/workspace/reference-events/${encodeURIComponent(contentId)}/${encodeURIComponent(occurrenceId)}`)
export const fetchReferencePlan=(id:string)=>requestJson<{plan:ReferencePlan}>(`/api/workspace/reference-plans/${encodeURIComponent(id)}`)
export const fetchReferenceReviewQueue=()=>requestJson<{items:ReferencePlan[];hasMore:boolean}>('/api/workspace/reference-plans/review?limit=100')
export const addReferencePlan=(input:unknown)=>workspaceMutation<{plan:ReferencePlan}>('/api/workspace/reference-plans','POST',input)
export const updateReferencePlanStatus=(id:string,status:string,expectedVersion:number)=>workspaceMutation<{plan:ReferencePlan}>(`/api/workspace/reference-plans/${encodeURIComponent(id)}/status`,'PATCH',{status,expectedVersion})
export const refreshReferencePlan=(id:string,expectedVersion:number)=>workspaceMutation<{plan:ReferencePlan}>(`/api/workspace/reference-plans/${encodeURIComponent(id)}/refresh`,'POST',{expectedVersion})
export const detachReferencePlan=(id:string,expectedVersion:number,keepEntry=false)=>workspaceMutation<{plan:ReferencePlan}>(`/api/workspace/reference-plans/${encodeURIComponent(id)}/detach`,'POST',{expectedVersion,keepEntry})

function getJson<T>(path: string) {
  return requestJson<T>(path)
}

export async function fetchPublicBootstrap() {
  try {
    return await getJson<PublicBootstrap>('/api/public')
  } catch {
    await new Promise((resolve) => globalThis.setTimeout(resolve, bootstrapRetryDelayMs))
    return getJson<PublicBootstrap>('/api/public')
  }
}

export type PublicIntakeConfiguration = {
  enabled: boolean
  siteKey?: string | null
  action?: string
  timingToken?: string
  districts?: string[]
  languageOverlays?: string[]
}

export function fetchPublicIntakeConfiguration() {
  return getJson<PublicIntakeConfiguration>('/api/public/outpost-submissions/config')
}

export function submitOutpostProposal(body: unknown) {
  return requestJson<{ status: 'received'; referenceCode: string }>(
    '/api/public/outpost-submissions',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    'The proposal could not be saved. Prepare an email or copy it instead.',
  )
}

export function fetchRecordPage(path: string, params: URLSearchParams, cursor: string | null = null) {
  const query = new URLSearchParams(params)
  if (cursor) query.set('cursor', cursor)
  return getJson<CursorPage<ContentRecord>>(`${path}?${query.toString()}`)
}

export function fetchOperatorRecord(id: string) {
  return getJson<{ record: ContentRecord }>(`/api/operator/records/${encodeURIComponent(id)}`)
}

export function fetchOperatorSnapshot() {
  return requestJson<OperatorSnapshot>('/api/operator/snapshot', undefined, 'Could not open the Operator workspace.')
}

export function fetchMaintenanceWorkspace(page?: {
  queue: keyof MaintenanceWorkspace['pagination']
  cursor: string
}) {
  const query = page ? `?queue=${encodeURIComponent(page.queue)}&cursor=${encodeURIComponent(page.cursor)}` : ''
  return requestJson<MaintenanceWorkspace>(`/api/operator/automation${query}`, undefined, 'Could not load the Automation workspace.')
}

export function fetchOperatorSubmissions(filters = new URLSearchParams()) {
  return requestJson<{
    items: DirectorySubmissionSummary[]
    counts: Partial<Record<DirectorySubmissionState, number>>
    nextCursor: string | null
  }>(`/api/operator/submissions?${filters.toString()}`, undefined, 'Could not load the private proposal queue.')
}

export function fetchOperatorSubmission(id: string) {
  return requestJson<{ item: DirectorySubmissionDetail }>(
    `/api/operator/submissions/${encodeURIComponent(id)}`,
    undefined,
    'Could not load the private proposal.',
  )
}

export function fetchStagedOutpostCandidates(filters = new URLSearchParams()) {
  return requestJson<{
    items: StagedOutpostCandidate[]
    counts: Partial<Record<StagedOutpostCandidate['state'], number>>
    nextCursor: string | null
  }>(`/api/operator/population/candidates?${filters.toString()}`, undefined, 'Could not load staged Outpost candidates.')
}

export function fetchStagedInternationalCandidates(filters = new URLSearchParams()) {
  return requestJson<{ items: import('../../shared/domain').StagedInternationalCandidate[]; truncated: boolean }>(
    `/api/operator/international-population/candidates?${filters.toString()}`,
    undefined,
    'Could not load staged International candidates.',
  )
}

export function fetchOperatorSession() {
  return requestJson<OperatorSession>('/api/operator/account/status', undefined, 'Could not load the Operator Account.')
}

export function searchOperatorOutposts(query: string) {
  return requestJson<{ items: Array<{ id: string; title: string }> }>(
    `/api/operator/account/outposts?q=${encodeURIComponent(query)}`,
    undefined,
    'Outpost choices could not be loaded.',
  )
}

export function runOperatorAccountAction<T = { ok?: boolean }>(path: string, method: 'POST' | 'PUT', body?: unknown) {
  return requestJson<T>(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, 'Operator Account action failed.')
}

export function fetchMoreOperatorRecords(cursor: string) {
  return requestJson<{ records: ContentRecord[]; nextCursor: string | null }>(
    `/api/operator/records?limit=20&cursor=${encodeURIComponent(cursor)}`,
    undefined,
    'More records could not be loaded.',
  )
}

export function saveOperatorRecord(record: ContentRecord, reason: string) {
  return requestJson<{ id?: string }>(
    record.id ? `/api/operator/records/${record.id}` : '/api/operator/records',
    {
      method: record.id ? 'PUT' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ record, expectedVersion: record.version, reason }),
    },
    'Save failed.',
  )
}

export function runOperatorAction<T = unknown>(path: string, method: 'POST' | 'PUT', body?: unknown) {
  return requestJson<T>(
    path,
    {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    'Operator action failed.',
  )
}

export type OrdinaryAccountConfiguration = {
  enabled: boolean
  signupEnabled: boolean
  localPreview: boolean
  siteKey: string | null
  action: string
}

export type OrdinarySession = {
  authenticated: boolean
  emailVerified?: boolean
  displayName?: string
  profileReady?: boolean
  lifecycleState?: 'active' | 'renewal-notice' | 'expired'
}

export type OrdinaryLifecycleStatus = {
  id: string
  state: 'active' | 'renewal-notice' | 'expired'
  accessDueAt: string
  noticeOpenAt: string
  confirmedDeliveryAt: string | null
  deletionDueAt: string | null
  renewalAllowed: boolean
  warningDelivery: 'not-due' | 'pending' | 'accepted' | 'failed'
  version: number
}

export type OrdinaryOutpostMatch = {
  id: string
  title: string
  church: string
  externalNumber: string | null
  city: string
  jurisdiction: string
}

export function fetchOrdinaryAccountConfiguration() {
  return requestJson<OrdinaryAccountConfiguration>('/api/account/config')
}

export function checkAdultEligibility(body: { birthYear: string; attested: boolean; challengeToken?: string }) {
  return requestJson<{ token: string; expiresAt: string }>('/api/account/eligibility', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

export function createOrdinaryAccount(body: {
  email: string
  password: string
  eligibilityToken: string
  profile: ValidatedOrdinaryProfile
}) {
  return requestJson<{ user?: { id: string }; status?: boolean }>('/api/auth/sign-up/email', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }, 'Account creation could not be completed.')
}

export function signInOrdinaryAccount(email: string, password: string) {
  return requestJson<{ user?: unknown; token?: string }>('/api/auth/sign-in/email', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, rememberMe: false }),
  }, 'Sign-in failed. Check the email, password, and verification status.')
}

export function signOutOrdinaryAccount() {
  return requestJson<{ success?: boolean }>('/api/auth/sign-out', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  }, 'Sign-out failed.')
}

export function fetchOrdinarySession() {
  return requestJson<OrdinarySession>('/api/account/session')
}

export function fetchOrdinaryProfile() {
  return requestJson<{ profile: OrdinaryAccountProfile }>('/api/account/profile')
}

export function fetchOrdinaryLifecycle() {
  return requestJson<{ lifecycle: OrdinaryLifecycleStatus }>('/api/account/lifecycle')
}

export function renewOrdinaryAccount(expectedVersion: number, idempotencyKey: string) {
  return requestJson<{ lifecycle: OrdinaryLifecycleStatus }>('/api/account/renew', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedVersion, idempotencyKey }),
  }, 'The Account could not be renewed.')
}

export function updateOrdinaryProfile(profile: ValidatedOrdinaryProfile, expectedVersion: number) {
  return requestJson<{ profile: OrdinaryAccountProfile }>('/api/account/profile', {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile, expectedVersion }),
  }, 'The private profile could not be updated.')
}

export function searchOrdinaryOutposts(
  path: 'usa' | 'international', scope: string, query: string, privateProfile = false,
) {
  const params = new URLSearchParams({ path, scope, q: query })
  if (privateProfile) params.set('context', 'profile')
  return requestJson<{ items: OrdinaryOutpostMatch[] }>(`/api/account/outposts?${params.toString()}`)
}

export function requestOrdinaryPasswordReset(email: string) {
  return requestJson<{ status: boolean; message: string }>('/api/auth/request-password-reset', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, redirectTo: '/reset-password' }),
  }, 'If the address is eligible, a recovery message will be sent.')
}

export function resetOrdinaryPassword(token: string, newPassword: string) {
  return requestJson<{ status: boolean }>('/api/auth/reset-password', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  }, 'The recovery link is invalid or expired.')
}

export function consumeLocalAuthPreview(purpose: 'verification' | 'password-reset' | 'renewal-warning') {
  return requestJson<{ url: string }>(`/api/account/local-email-preview?purpose=${purpose}`)
}
