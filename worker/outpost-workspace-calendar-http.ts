import { ordinaryAuthConfiguration, ordinarySessionWithLifecycle, type OrdinaryAuthEnv } from './ordinary-auth'
import {
  WorkspaceCalendarError, cancelCalendarEntry, createCalendarEntry, getCalendarEntry, getWorkspaceSummary,
  listCalendarEntries, listCalendarHistory, setWorkspaceTimezone, updateCalendarEntry,
} from './outpost-workspace-calendar-repository'
import { addReferencePlan, detachReferencePlan, getReferenceEligibility, getReferencePlan, listReferenceReviewQueue, refreshReferencePlan, updateReferencePlanStatus } from './reference-event-plan-repository'

const MAX_BODY_BYTES = 16_384
const headers = { 'cache-control': 'private, no-store', pragma: 'no-cache', 'referrer-policy': 'no-referrer' }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers })

async function body(request: Request) {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) throw new WorkspaceCalendarError('Request body is too large.', 413)
  const source = await request.text()
  if (new TextEncoder().encode(source).byteLength > MAX_BODY_BYTES) throw new WorkspaceCalendarError('Request body is too large.', 413)
  try {
    const parsed = JSON.parse(source) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
    return parsed as Record<string, unknown>
  } catch { throw new WorkspaceCalendarError('Request body must be a JSON object.', 400) }
}

async function principal(request: Request, env: OrdinaryAuthEnv) {
  const current = await ordinarySessionWithLifecycle(request, env)
  if (!current?.session.user?.emailVerified || !current.lifecycle || !['active', 'renewal-notice'].includes(current.lifecycle.state)) {
    throw new WorkspaceCalendarError('Workspace unavailable.', 404)
  }
  return current.session.user.id
}

export async function handleOutpostWorkspaceCalendar(request: Request, env: OrdinaryAuthEnv) {
  const url = new URL(request.url)
  try {
    const configuration = ordinaryAuthConfiguration(request, env)
    if (!configuration.enabled) throw new WorkspaceCalendarError('Workspace unavailable.', 404)
    if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== configuration.origin) throw new WorkspaceCalendarError('Same-origin request required.', 403)
    const authUserId = await principal(request, env)
    const now = new Date().toISOString()

    if (request.method === 'GET' && url.pathname === '/api/workspace') return json(await getWorkspaceSummary(env.DB, authUserId, now))
    if (request.method === 'PUT' && url.pathname === '/api/workspace/timezone') {
      const input = await body(request)
      return json(await setWorkspaceTimezone(env.DB, authUserId, { timeZone: input.timeZone, expectedVersion: input.expectedVersion }, now))
    }
    if (request.method === 'GET' && url.pathname === '/api/workspace/calendar') return json(await listCalendarEntries(env.DB, authUserId, url.searchParams, now))
    if (request.method === 'POST' && url.pathname === '/api/workspace/calendar') return json({ entry: await createCalendarEntry(env.DB, authUserId, await body(request), now) }, 201)
    if (request.method === 'POST' && url.pathname === '/api/workspace/reference-plans') return json({ plan: await addReferencePlan(env.DB,authUserId,await body(request),now) },201)
    if (request.method === 'GET' && url.pathname === '/api/workspace/reference-plans/review') return json(await listReferenceReviewQueue(env.DB,authUserId,url.searchParams.get('limit'),now))
    const eligibility=url.pathname.match(/^\/api\/workspace\/reference-events\/([^/]+)\/([^/]+)$/)
    if(request.method==='GET'&&eligibility)return json(await getReferenceEligibility(env.DB,authUserId,decodeURIComponent(eligibility[1]),decodeURIComponent(eligibility[2]),now))
    const planMatch=url.pathname.match(/^\/api\/workspace\/reference-plans\/([^/]+)(?:\/(status|refresh|detach))?$/)
    if(planMatch){const planId=decodeURIComponent(planMatch[1])
      if(request.method==='GET'&&!planMatch[2])return json({plan:await getReferencePlan(env.DB,authUserId,planId,now)})
      if(request.method==='PATCH'&&planMatch[2]==='status'){const input=await body(request);return json({plan:await updateReferencePlanStatus(env.DB,authUserId,planId,input.status,input.expectedVersion,now)})}
      if(request.method==='POST'&&planMatch[2]==='refresh'){const input=await body(request);return json({plan:await refreshReferencePlan(env.DB,authUserId,planId,input.expectedVersion,now)})}
      if(request.method==='POST'&&planMatch[2]==='detach'){const input=await body(request);return json({plan:await detachReferencePlan(env.DB,authUserId,planId,input.expectedVersion,input.keepEntry===true,now)})}
    }
    const match = url.pathname.match(/^\/api\/workspace\/calendar\/([^/]+)(?:\/(history|cancel))?$/)
    if (match) {
      const entryId = decodeURIComponent(match[1])
      if (request.method === 'GET' && match[2] === 'history') return json({ items: await listCalendarHistory(env.DB, authUserId, entryId, now) })
      if (request.method === 'GET' && !match[2]) return json({ entry: await getCalendarEntry(env.DB, authUserId, entryId, now) })
      if (request.method === 'PUT' && !match[2]) {
        const input = await body(request)
        return json({ entry: await updateCalendarEntry(env.DB, authUserId, entryId, input.entry, input.expectedVersion, now) })
      }
      if (request.method === 'POST' && match[2] === 'cancel') {
        const input = await body(request)
        return json({ entry: await cancelCalendarEntry(env.DB, authUserId, entryId, input.expectedVersion, now) })
      }
    }
    throw new WorkspaceCalendarError('Workspace unavailable.', 404)
  } catch (error) {
    if (error instanceof WorkspaceCalendarError) return json({ error: error.message }, error.status)
    const message = error instanceof Error ? error.message : ''
    if (/^(Choose|Title|Description|Location|Start|End|The end|An all-day|A timed|Calendar entry|Reference plan|Private note|Request key|Review queue)/.test(message)) return json({ error: message }, 400)
    return json({ error: 'Workspace unavailable.' }, 404)
  }
}
