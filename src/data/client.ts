import type { ContentRecord, CursorPage, DirectorySubmissionDetail, DirectorySubmissionState, DirectorySubmissionSummary, OperatorSession, OperatorSnapshot, PublicBootstrap, StagedOutpostCandidate } from '../../shared/domain'

type ErrorPayload = { error?: string }

const bootstrapRetryDelayMs = 250

async function requestJson<T>(path: string, init?: RequestInit, fallbackMessage = 'The requested information could not be loaded.') {
  const response = await fetch(path, init)
  const data = await response.json() as T & ErrorPayload
  if (!response.ok) throw new Error(data.error || fallbackMessage)
  return { data, fromCache: response.headers.get('x-ranger-data-source') === 'cache' }
}

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
