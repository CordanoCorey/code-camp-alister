import { validateAdvancementDetails } from '../shared/advancement'
import { validatePublishedEvent } from '../shared/events'
import {
  ADULT_ATTESTATION_VERSION,
  addCalendarYears,
  createAcceptanceToken,
  hashAcceptanceToken,
  isRecentAuthentication,
  nextRenewalDueAt,
  normalizeAccessEmail,
  validateAdultEligibility,
  validateDisplayName,
} from '../shared/operator-lifecycle'
import { verifyAccessIdentity, type AccessIdentity } from './access-identity'
import {
  acceptOperatorTransfer,
  authorizeOperatorIdentity,
  cancelOperatorTransfer,
  claimOperatorAccount,
  confirmAccessCleanup,
  consumeReauthenticationIntent,
  createReauthenticationIntent,
  expireOperatorTransfer,
  getPendingTransferForActive,
  listOperatorOutposts,
  recordRenewalNotice,
  renewOperatorAccount,
  stageOperatorTransfer,
  updateOperatorSettings,
  type OperatorAuthorization,
  type OperatorPrincipal,
} from './operator-lifecycle-repository'
import {
  getOperatorRecord,
  getFreshnessQueue,
  getPublicBootstrap,
  getPublicRecordBySlug,
  listOperatorRecords,
  listPublicAdvancement,
  listPublicEvents,
  listPublicKind,
  listPublicOutposts,
  publicCacheControl,
  searchPublic,
} from './content-repository'
import { CursorInputError, decodeCursor, encodeCursor, readPageSize } from './pagination'
import { saveNormalizedRecord, type EditableRecord } from './content-writes'
import { handlePublicOutpostIntake, type PublicIntakeEnv } from './public-outpost-intake'
import {
  handleOrdinaryAuth,
  ordinaryAuthConfiguration,
  type OrdinaryAuthEnv,
} from './ordinary-auth'
import { handleOrdinaryAccount } from './ordinary-account-http'
import { handleOutpostWorkspaceCalendar } from './outpost-workspace-calendar-http'
import {
  applyStagedOutpostCandidate,
  getPopulationReport,
  listStagedOutpostCandidates,
  stageOutpostManifest,
} from './outpost-population'
import {
  getDirectorySubmission,
  listDirectorySubmissions,
  convertDirectorySubmissionToDraft,
  scrubDirectorySubmission,
  transitionDirectorySubmission,
  updateOutpostLifecycle,
} from './directory-operations'
import { runMaintenance } from './maintenance'
import {
  approveSourceMonitor,
  getMaintenanceWorkspace,
  reviewAutomatedUpdateCandidate,
  reviewAutomationAlert,
  resetMaintenanceJobCircuit,
  setSourceMonitorState,
  updateMaintenanceJob,
} from './maintenance-operations'
import {
  eventLifecycleStatuses,
  isPublicationStatus,
  isRecordKind,
  type AuditEvent,
  type BrokenSourceObservation,
  type ContentRecord,
  type CoverageGap,
  type EventConflict,
  type EventConflictAssertion,
  type EventDetails,
  type OperatorSnapshot,
  type OperatorSession,
  type OutpostDetails,
} from '../shared/domain'

type Env = PublicIntakeEnv & OrdinaryAuthEnv & {
  ASSETS: Fetcher
  LOCAL_OPERATOR_PREVIEW?: string
  ACCESS_TEAM_DOMAIN?: string
  ACCESS_POLICY_AUD?: string
}

function ordinaryLifecycleMaintenanceConfiguration(env: Env, requestOrigin?: string) {
  const origin = requestOrigin ?? env.AUTH_CANONICAL_ORIGIN
  if (!origin) return undefined
  const configuration = ordinaryAuthConfiguration(new Request(`${origin}/`), env)
  if (!configuration.enabled || !configuration.email) return undefined
  return { accountUrl: `${configuration.origin}/account`, email: configuration.email }
}

type SourceRow = {
  id: string
  record_id: string
  field_name: string
  label: string
  url: string
  verified_at: string
}

type AuditRow = {
  id: number
  record_id: string
  action: string
  actor_label: string
  reason: string | null
  created_at: string
}

type ConflictRow = {
  id: string
  event_id: string
  field_name: string
  assertions_json: string
  status: string
  opened_at: string
  opened_by: string
  resolution_note: string | null
  resolved_at: string | null
  resolved_by: string | null
}

type BrokenSourceRow = {
  id: string
  source_id: string
  record_id: string
  observed_at: string
  observed_by: string
  note: string
  cleared_at: string | null
  cleared_by: string | null
}

type CoverageGapRow = {
  id: string
  scope: string
  description: string
  source_url: string | null
  last_checked_at: string | null
  status: string
  resolution_reason: string | null
  created_at: string
  created_by: string
  resolved_at: string | null
  resolved_by: string | null
}

const MAX_REQUEST_BYTES = 65_536
const CURRENT_SCHEMA_MIGRATION = '0016_reference_event_outpost_plans.sql'
const REAUTHENTICATION_COOKIE = 'ranger_operator_reauth'

class RequestInputError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(data), { ...init, headers })
}

function error(message: string, status = 400) {
  return json({ error: message }, { status })
}

async function readJsonBody<T>(request: Request): Promise<T> {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new RequestInputError('Request body is too large.', 413)
  }
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    throw new RequestInputError('Request body is too large.', 413)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new RequestInputError('Request body must be valid JSON.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RequestInputError('Request body must be a JSON object.')
  }
  return parsed as T
}

function currentOutpostId(value: unknown) {
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new RequestInputError('Choose an existing Hub Outpost or No Current Outpost.')
  }
  return value
}

function respondToActionError(errorValue: unknown, fallback: string) {
  if (errorValue instanceof RequestInputError) return error(errorValue.message, errorValue.status)
  if (errorValue instanceof Error && (
    errorValue.message.includes('content version conflict') ||
    errorValue.message === 'This record changed after you opened it. Reload it before saving.'
  )) {
    return error('This record changed after you opened it. Reload it before saving.', 409)
  }
  if (errorValue instanceof Error && errorValue.message.includes('FOREIGN KEY constraint failed')) {
    return error('This change references missing or protected related data. Reload the record and review its relationships or sources.', 409)
  }
  return error(errorValue instanceof Error ? errorValue.message : fallback)
}

function enforceTextLimit(label: string, value: unknown, maximum: number) {
  if (typeof value === 'string' && value.trim().length > maximum) {
    throw new RequestInputError(`${label} must be ${maximum} characters or fewer.`)
  }
}

function toConflict(row: ConflictRow): EventConflict {
  return {
    id: row.id,
    eventId: row.event_id,
    fieldName: row.field_name,
    assertions: JSON.parse(row.assertions_json) as EventConflictAssertion[],
    status: row.status as EventConflict['status'],
    openedAt: row.opened_at,
    openedBy: row.opened_by,
    resolutionNote: row.resolution_note,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
  }
}

function toBrokenSource(row: BrokenSourceRow): BrokenSourceObservation {
  return {
    id: row.id,
    sourceId: row.source_id,
    recordId: row.record_id,
    observedAt: row.observed_at,
    observedBy: row.observed_by,
    note: row.note,
    clearedAt: row.cleared_at,
    clearedBy: row.cleared_by,
  }
}

function toCoverageGap(row: CoverageGapRow): CoverageGap {
  return {
    id: row.id,
    scope: row.scope,
    description: row.description,
    sourceUrl: row.source_url,
    lastCheckedAt: row.last_checked_at,
    status: row.status as CoverageGap['status'],
    resolutionReason: row.resolution_reason,
    createdAt: row.created_at,
    createdBy: row.created_by,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
  }
}

async function getConflicts(db: D1Database) {
  const rows = await db.prepare(`SELECT conflict.id, conflict.occurrence_id event_id,
    conflict.field_path field_name, conflict.status, conflict.opened_at, conflict.opened_by,
    resolution.resolution_note, conflict.resolved_at, conflict.resolved_by,
    COALESCE((SELECT json_group_array(json_object('sourceId', assertion.provenance_id,
      'sourceLabel', assertion.source_label, 'assertedValue', assertion.asserted_value))
      FROM event_conflict_assertions assertion WHERE assertion.conflict_id = conflict.id), '[]') assertions_json
    FROM normalized_event_conflicts conflict
    LEFT JOIN event_conflict_resolutions resolution ON resolution.conflict_id = conflict.id
    ORDER BY conflict.opened_at DESC LIMIT 50`).all<ConflictRow>()
  return rows.results.map(toConflict)
}

async function getBrokenSources(db: D1Database) {
  const rows = await db.prepare(`SELECT id, provenance_id source_id, content_id record_id,
    observed_at, observed_by, note, cleared_at, cleared_by
    FROM source_health_observations ORDER BY observed_at DESC LIMIT 50`).all<BrokenSourceRow>()
  return rows.results.map(toBrokenSource)
}

async function getCoverageGaps(db: D1Database) {
  const rows = await db.prepare(`SELECT gap.id, gap.scope_text scope, gap.description, document.url source_url,
    gap.last_checked_at, gap.status, gap.resolution_reason, gap.created_at, gap.created_by,
    gap.resolved_at, gap.resolved_by FROM normalized_coverage_gaps gap
    LEFT JOIN source_documents document ON document.id = gap.source_document_id
    ORDER BY gap.created_at DESC LIMIT 50`).all<CoverageGapRow>()
  return rows.results.map(toCoverageGap)
}

function parseEditableRecord(value: unknown): EditableRecord {
  if (!value || typeof value !== 'object') throw new Error('A record is required.')
  const record = value as Partial<EditableRecord>
  if (!isRecordKind(record.kind)) throw new Error('Choose a valid record type.')
  if (!isPublicationStatus(record.status)) throw new Error('Choose a valid status.')
  if (!record.title?.trim() || !record.summary?.trim() || !record.slug?.trim()) {
    throw new Error('Title, summary, and slug are required.')
  }
  enforceTextLimit('Title', record.title, 200)
  enforceTextLimit('Summary', record.summary, 2_000)
  enforceTextLimit('Slug', record.slug, 120)
  if (!record.details || typeof record.details !== 'object') {
    throw new Error('Record details are required.')
  }
  if (!Array.isArray(record.sources) || record.sources.length === 0) {
    throw new Error('At least one source is required.')
  }
  if (record.sources.length > 40) throw new Error('A record may have at most 40 field sources.')
  for (const source of record.sources) {
    if (
      !source.fieldName?.trim() ||
      !source.label?.trim() ||
      !source.url?.startsWith('https://') ||
      !source.verifiedAt
    ) {
      throw new Error('Every source needs a field name, label, HTTPS URL, and verified date.')
    }
    enforceTextLimit('Source field name', source.fieldName, 100)
    enforceTextLimit('Source label', source.label, 200)
    enforceTextLimit('Source URL', source.url, 2_048)
  }
  if (record.kind === 'outpost') validateOutpost(record as EditableRecord)
  if (record.kind === 'advancement') validateAdvancement(record as EditableRecord)
  if (record.kind === 'event') validateEvent(record as EditableRecord)
  return record as EditableRecord
}

function validateEvent(record: EditableRecord) {
  const validationErrors = validatePublishedEvent(record as ContentRecord)
  if (validationErrors.length > 0) throw new Error(validationErrors.join(' '))
}

function validateAdvancement(record: EditableRecord) {
  const validationErrors = validateAdvancementDetails(record.details)
  if (validationErrors.length > 0) throw new Error(validationErrors.join(' '))
  if (record.status === 'published' && !record.verifiedAt) {
    throw new Error('Published advancement records need a verification date.')
  }
}

function validateOutpost(record: EditableRecord) {
  const details = record.details as Partial<OutpostDetails>
  if (!details.church?.trim() || !details.countryCode?.trim() || !details.countryName?.trim() || !details.jurisdiction?.trim()) {
    throw new Error('Outpost facts need a church name, ISO country, country name, and civil location.')
  }
  if (details.contactUrl && !details.contactUrl.startsWith('https://')) {
    throw new Error('The public church contact route must be an HTTPS URL.')
  }
  if (record.status !== 'published') return
  if (!record.verifiedAt) throw new Error('Published outpost listings need a Listing Verification date.')

  const fields: Array<[keyof OutpostDetails, unknown]> = [
    ['outpostNumber', details.outpostNumber],
    ['campusSuffix', details.campusSuffix],
    ['church', details.church],
    ['streetAddress', details.streetAddress],
    ['city', details.city],
    ['jurisdiction', details.jurisdiction],
    ['postalCode', details.postalCode],
    ['district', details.district],
    ['region', details.region],
    ['languageOverlay', details.languageOverlay],
    ['fcfTerritory', details.fcfTerritory],
    ['activeFcf', details.activeFcf],
    ['programs', details.programs],
    ['meeting', details.meeting],
    ['contactUrl', details.contactUrl],
  ]
  if (details.countryCode !== 'US') fields.push(
    ['countryCode', details.countryCode],
    ['countryName', details.countryName],
    ['civilSubdivisionLabel', details.civilSubdivisionLabel],
    ['fcfAvailability', details.fcfAvailability],
    ['affiliations', details.affiliations],
  )
  const sourcedFields = new Set(record.sources.map((source) => source.fieldName))
  const missing = fields
    .filter(([, fieldValue]) => {
      if (Array.isArray(fieldValue)) return fieldValue.length > 0
      if (typeof fieldValue === 'string') return fieldValue.trim().length > 0
      return fieldValue !== null && fieldValue !== undefined
    })
    .map(([fieldName]) => fieldName)
    .filter((fieldName) => !sourcedFields.has(fieldName))
  if (missing.length > 0) {
    throw new Error(`Add a field-level source for: ${missing.join(', ')}.`)
  }
  const verificationDate = record.verifiedAt.slice(0, 10)
  const stale = fields
    .filter(([, fieldValue]) => {
      if (Array.isArray(fieldValue)) return fieldValue.length > 0
      if (typeof fieldValue === 'string') return fieldValue.trim().length > 0
      return fieldValue !== null && fieldValue !== undefined
    })
    .map(([fieldName]) => fieldName)
    .filter((fieldName) => !record.sources.some((source) => (
      source.fieldName === fieldName && source.verifiedAt.slice(0, 10) === verificationDate
    )))
  if (stale.length > 0) {
    throw new Error(`Recheck each populated field on the Listing Verification date: ${stale.join(', ')}.`)
  }
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get('cookie') ?? ''
  for (const part of cookie.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=')
  }
  return null
}

function lifecycleConflict(errorValue: unknown, fallback: string) {
  if (errorValue instanceof RequestInputError) return error(errorValue.message, errorValue.status)
  if (errorValue instanceof Error && (
    errorValue.message.includes('operator lifecycle transition conflict')
    || errorValue.message.includes('UNIQUE constraint failed')
    || errorValue.message.includes('operator transfer predecessor is not active')
  )) return error('The Operator Account changed. Reload and try again.', 409)
  if (errorValue instanceof Error && errorValue.message.includes('FOREIGN KEY constraint failed')) {
    return error('Choose an existing Outpost Hub listing or No Current Outpost.', 400)
  }
  return error(fallback)
}

function unauthorizedRole() {
  return error('This Access identity is not authorized for that Operator action.', 403)
}

async function requireRecentOperatorAction(
  request: Request,
  db: D1Database,
  identity: AccessIdentity,
  principal: OperatorPrincipal,
  intendedAction: 'renew' | 'transfer' | 'settings',
  now: Date,
) {
  if (identity.localPreview || isRecentAuthentication(identity.issuedAt, now)) return
  const token = cookieValue(request, REAUTHENTICATION_COOKIE)
  if (token) {
    try {
      const accepted = await consumeReauthenticationIntent(db, {
        tokenHash: await hashAcceptanceToken(token),
        principal,
        intendedAction,
        accessIssuedAt: identity.issuedAt,
        consumedAt: now.toISOString(),
      })
      if (accepted) return
    } catch {
      // A missing, expired, or already-consumed intent is handled as a fresh-session requirement.
    }
  }
  throw new RequestInputError('A fresh Cloudflare Access session is required for this action.', 403)
}

async function handleOperatorLifecycle(
  request: Request,
  env: Env,
  identity: AccessIdentity,
  authorization: OperatorAuthorization,
  requestId: string,
  now: Date,
): Promise<Response | null> {
  const url = new URL(request.url)
  const path = url.pathname
  const nowIso = now.toISOString()

  if (request.method === 'GET' && path === '/api/operator/account/status') {
    if (authorization.role === 'unclaimed') {
      const session: OperatorSession = {
        role: 'unclaimed', email: identity.email,
        recentAuthentication: identity.localPreview || isRecentAuthentication(identity.issuedAt, now),
      }
      return json(session)
    }
    if (authorization.role === 'pending-successor') {
      const session: OperatorSession = {
        role: 'pending-successor', transferId: authorization.transferId,
        transfer: authorization.transfer,
        recentAuthentication: identity.localPreview || isRecentAuthentication(identity.issuedAt, now),
      }
      return json(session)
    }
    if (authorization.role !== 'active') return unauthorizedRole()
    await recordRenewalNotice(env.DB, authorization.account, nowIso)
    let pendingTransfer = await getPendingTransferForActive(env.DB, authorization.principal)
    if (pendingTransfer && new Date(pendingTransfer.expiresAt).valueOf() <= now.valueOf()) {
      try {
        await expireOperatorTransfer(env.DB, {
          transferId: pendingTransfer.id,
          predecessorTenureNumber: authorization.principal.tenureNumber,
          expiredAt: nowIso,
          requestId,
        })
      } catch {
        // Another request may have already made the pending transfer terminal.
      }
      pendingTransfer = null
    }
    const session: OperatorSession = {
      role: 'active', account: authorization.account, pendingTransfer,
      recentAuthentication: identity.localPreview || isRecentAuthentication(identity.issuedAt, now),
    }
    return json(session)
  }

  if (request.method === 'GET' && path === '/api/operator/account/outposts') {
    if (authorization.role !== 'unclaimed' && authorization.role !== 'active') return unauthorizedRole()
    const query = (url.searchParams.get('q') ?? '').trim()
    if (query.length > 80) return error('Outpost search must be 80 characters or fewer.')
    return json({ items: await listOperatorOutposts(env.DB, query) })
  }

  if (request.method === 'POST' && path === '/api/operator/account/claim') {
    if (authorization.role !== 'unclaimed') return unauthorizedRole()
    try {
      if (!identity.localPreview && !isRecentAuthentication(identity.issuedAt, now)) {
        throw new RequestInputError('A fresh Cloudflare Access session is required for setup.', 403)
      }
      const body = await readJsonBody<{
        displayName?: unknown
        currentOutpostId?: unknown
        birthYear?: unknown
        adultAttestation?: unknown
      }>(request)
      const displayName = validateDisplayName(body.displayName)
      const selectedCurrentOutpostId = currentOutpostId(body.currentOutpostId)
      validateAdultEligibility(body.birthYear, body.adultAttestation, now)
      await claimOperatorAccount(env.DB, {
        displayName,
        email: identity.email,
        currentOutpostId: selectedCurrentOutpostId,
        confirmedAt: nowIso,
        renewalDueAt: addCalendarYears(nowIso, 4),
        attestationVersion: ADULT_ATTESTATION_VERSION,
        requestId,
      })
      return json({ ok: true }, { status: 201 })
    } catch (claimError) {
      return lifecycleConflict(claimError, 'The Operator Account could not be claimed.')
    }
  }

  if (request.method === 'POST' && path === '/api/operator/account/reauthenticate') {
    if (authorization.role !== 'active') return unauthorizedRole()
    try {
      const body = await readJsonBody<{ intendedAction?: unknown }>(request)
      if (body.intendedAction !== 'renew' && body.intendedAction !== 'transfer' && body.intendedAction !== 'settings') {
        throw new RequestInputError('Choose a valid account action to resume.')
      }
      if (identity.localPreview) return json({ ready: true })
      const token = createAcceptanceToken()
      await createReauthenticationIntent(env.DB, {
        tokenHash: await hashAcceptanceToken(token),
        principal: authorization.principal,
        intendedAction: body.intendedAction,
        createdAt: nowIso,
        expiresAt: new Date(now.valueOf() + 15 * 60 * 1_000).toISOString(),
      })
      return json({ logoutUrl: '/cdn-cgi/access/logout' }, {
        headers: {
          'set-cookie': `${REAUTHENTICATION_COOKIE}=${token}; Max-Age=900; Path=/api/operator/account; HttpOnly; Secure; SameSite=Strict`,
        },
      })
    } catch (reauthError) {
      return lifecycleConflict(reauthError, 'A fresh Access session could not be started.')
    }
  }

  if (request.method === 'PUT' && path === '/api/operator/account/settings') {
    if (authorization.role !== 'active') return unauthorizedRole()
    try {
      await requireRecentOperatorAction(request, env.DB, identity, authorization.principal, 'settings', now)
      const body = await readJsonBody<{ displayName?: unknown; currentOutpostId?: unknown; expectedVersion?: unknown }>(request)
      const selectedCurrentOutpostId = currentOutpostId(body.currentOutpostId)
      if (!Number.isInteger(body.expectedVersion)) throw new RequestInputError('Reload account settings before saving.')
      await updateOperatorSettings(env.DB, {
        principal: authorization.principal,
        displayName: validateDisplayName(body.displayName),
        currentOutpostId: selectedCurrentOutpostId,
        expectedVersion: body.expectedVersion as number,
        updatedAt: nowIso,
        requestId,
      })
      return json({ ok: true })
    } catch (settingsError) {
      return lifecycleConflict(settingsError, 'Account settings could not be updated.')
    }
  }

  if (request.method === 'POST' && path === '/api/operator/account/renew') {
    if (authorization.role !== 'active') return unauthorizedRole()
    try {
      await requireRecentOperatorAction(request, env.DB, identity, authorization.principal, 'renew', now)
      const newDueAt = nextRenewalDueAt(authorization.account.renewalDueAt, nowIso)
      await renewOperatorAccount(env.DB, {
        principal: authorization.principal,
        priorDueAt: authorization.account.renewalDueAt,
        newDueAt,
        confirmedAt: nowIso,
        requestId,
      })
      return json({ renewalDueAt: newDueAt })
    } catch (renewalError) {
      return lifecycleConflict(renewalError, 'Operator privileges could not be renewed.')
    }
  }

  if (request.method === 'POST' && path === '/api/operator/account/transfer') {
    if (authorization.role !== 'active') return unauthorizedRole()
    try {
      await requireRecentOperatorAction(request, env.DB, identity, authorization.principal, 'transfer', now)
      const body = await readJsonBody<{
        successorDisplayName?: unknown
        successorEmail?: unknown
        successorCurrentOutpostId?: unknown
        deliberateConfirmation?: unknown
      }>(request)
      if (body.deliberateConfirmation !== true) throw new RequestInputError('Confirm that you intend to stage this transfer.')
      const successorEmail = normalizeAccessEmail(body.successorEmail)
      if (successorEmail === identity.email) throw new RequestInputError('Use a different verified email for the successor.')
      const successorCurrentOutpostId = currentOutpostId(body.successorCurrentOutpostId)
      const token = createAcceptanceToken()
      const transferId = crypto.randomUUID()
      await stageOperatorTransfer(env.DB, {
        transferId,
        predecessor: authorization.principal,
        successorDisplayName: validateDisplayName(body.successorDisplayName),
        successorEmail,
        successorCurrentOutpostId,
        tokenHash: await hashAcceptanceToken(token),
        createdAt: nowIso,
        expiresAt: new Date(now.valueOf() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
        requestId,
        initiationKind: 'operator',
      })
      return json({ acceptanceLink: `${url.origin}/operator#transfer=${token}` }, { status: 201 })
    } catch (transferError) {
      return lifecycleConflict(transferError, 'The Operator transfer could not be staged.')
    }
  }

  if (request.method === 'POST' && path === '/api/operator/account/transfer/cancel') {
    if (authorization.role !== 'active') return unauthorizedRole()
    const pending = await getPendingTransferForActive(env.DB, authorization.principal)
    if (!pending) return error('There is no pending transfer to cancel.', 409)
    try {
      await cancelOperatorTransfer(env.DB, {
        transferId: pending.id,
        principal: authorization.principal,
        cancelledAt: nowIso,
        requestId,
      })
      return json({ ok: true })
    } catch (cancelError) {
      return lifecycleConflict(cancelError, 'The Operator transfer could not be cancelled.')
    }
  }

  if (request.method === 'POST' && path === '/api/operator/account/transfer/accept') {
    if (authorization.role !== 'pending-successor') return unauthorizedRole()
    try {
      const body = await readJsonBody<{
        token?: unknown
        birthYear?: unknown
        adultAttestation?: unknown
        responsibilityAccepted?: unknown
        currentOutpostAccepted?: unknown
      }>(request)
      if (body.responsibilityAccepted !== true || body.currentOutpostAccepted !== true) {
        throw new RequestInputError('Accept the site responsibility and shown Current Outpost to continue.')
      }
      validateAdultEligibility(body.birthYear, body.adultAttestation, now)
      if (typeof body.token !== 'string') throw new RequestInputError('The transfer acceptance token is required.')
      await acceptOperatorTransfer(env.DB, {
        transferId: authorization.transferId,
        successorEmail: identity.email,
        tokenHash: await hashAcceptanceToken(body.token),
        acceptedAt: nowIso,
        renewalDueAt: addCalendarYears(nowIso, 4),
        attestationVersion: ADULT_ATTESTATION_VERSION,
        requestId,
      })
      return json({ ok: true })
    } catch (acceptError) {
      return lifecycleConflict(acceptError, 'The Operator transfer could not be accepted.')
    }
  }

  if (request.method === 'POST' && path === '/api/operator/account/access-cleanup') {
    if (authorization.role !== 'active') return unauthorizedRole()
    try {
      await confirmAccessCleanup(env.DB, { principal: authorization.principal, confirmedAt: nowIso, requestId })
      return json({ ok: true })
    } catch (cleanupError) {
      return lifecycleConflict(cleanupError, 'Access cleanup confirmation could not be recorded.')
    }
  }

  return null
}

async function handleApi(request: Request, env: Env, requestId: string): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname

  if ((request.method === 'GET' || request.method === 'HEAD') && path === '/api/health') {
    try {
      const migration = await env.DB.prepare(
        'SELECT name FROM d1_migrations WHERE name = ? LIMIT 1',
      ).bind(CURRENT_SCHEMA_MIGRATION).first<{ name: string }>()
      if (!migration) throw new Error('Current schema migration is missing.')
      if (request.method === 'HEAD') {
        return new Response(null, {
          headers: {
            'cache-control': 'no-store',
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }
      return json({ status: 'ok', schema: '0015' })
    } catch {
      if (request.method === 'HEAD') {
        return new Response(null, {
          status: 503,
          headers: {
            'cache-control': 'no-store',
            'content-type': 'application/json; charset=utf-8',
          },
        })
      }
      return json({ status: 'unavailable' }, { status: 503 })
    }
  }

  if (path.startsWith('/api/auth/')) {
    return handleOrdinaryAuth(request, env, requestId)
  }

  if (path.startsWith('/api/account/')) {
    return handleOrdinaryAccount(request, env)
  }

  if (path === '/api/workspace' || path.startsWith('/api/workspace/')) {
    return handleOutpostWorkspaceCalendar(request, env)
  }

  if (request.method === 'GET' && path === '/api/public') {
    return json(await getPublicBootstrap(env.DB), { headers: { 'cache-control': publicCacheControl } })
  }

  if (path === '/api/public/outpost-submissions/config' || path === '/api/public/outpost-submissions') {
    return handlePublicOutpostIntake(request, env)
  }

  if (request.method === 'GET' && (path === '/api/search' || path.startsWith('/api/public/'))) {
    try {
      let result: unknown
      if (path === '/api/search') result = await searchPublic(env.DB, url.searchParams)
      else if (path === '/api/public/outposts') result = await listPublicOutposts(env.DB, url.searchParams)
      else if (path === '/api/public/advancement') result = await listPublicAdvancement(env.DB, url.searchParams)
      else if (path === '/api/public/events') result = await listPublicEvents(env.DB, url.searchParams)
      else if (path === '/api/public/organizations') result = await listPublicKind(env.DB, 'organization', url.searchParams)
      else if (path === '/api/public/pages') result = await listPublicKind(env.DB, 'page', url.searchParams)
      else {
        const detailMatch = path.match(/^\/api\/public\/records\/([^/]+)$/)
        if (!detailMatch) return error('Not found.', 404)
        const record = await getPublicRecordBySlug(env.DB, decodeURIComponent(detailMatch[1]))
        if (!record) return error('Record not found.', 404)
        result = { record }
      }
      return json(result, { headers: { 'cache-control': publicCacheControl } })
    } catch (queryError) {
      const message = queryError instanceof Error ? queryError.message : 'The listing request is invalid.'
      return error(message, queryError instanceof CursorInputError ? 400 : 400)
    }
  }

  if (!path.startsWith('/api/operator')) return error('Not found.', 404)

  let identity: AccessIdentity
  try {
    identity = await verifyAccessIdentity(request, env)
  } catch {
    return error('Operator authorization required.', 401)
  }

  const now = new Date()
  let authorization: OperatorAuthorization
  try {
    authorization = await authorizeOperatorIdentity(env.DB, identity.email, now.toISOString())
  } catch {
    return error('Operator authorization is temporarily unavailable.', 503)
  }

  const lifecycleResponse = await handleOperatorLifecycle(
    request, env, identity, authorization, requestId, now,
  )
  if (lifecycleResponse) return lifecycleResponse
  if (authorization.role !== 'active') return unauthorizedRole()
  if (request.method === 'GET' && path === '/api/operator/automation') {
    try {
      const search = new URL(request.url).searchParams
      const queue = search.get('queue')
      const cursor = search.get('cursor')
      const validQueues = ['monitors', 'availableSources', 'candidates', 'alerts'] as const
      if ((queue === null) !== (cursor === null)
        || (queue !== null && !validQueues.includes(queue as typeof validQueues[number]))) {
        throw new CursorInputError('The Automation page cursor is invalid.')
      }
      return json(await getMaintenanceWorkspace(
        env.DB,
        now.toISOString(),
        authorization.account.lifecycleState === 'renewal-required',
        queue && cursor ? { queue: queue as typeof validQueues[number], cursor } : undefined,
      ))
    } catch (workspaceError) {
      return workspaceError instanceof CursorInputError
        ? error('The Automation page cursor is invalid.', 400)
        : error('Automation status is temporarily unavailable.', 503)
    }
  }
  if (authorization.account.lifecycleState === 'renewal-required') {
    return json({ error: 'Operator privilege renewal is required.', code: 'renewal-required' }, { status: 423 })
  }
  const actor = authorization.principal

  if (request.method === 'POST' && path === '/api/operator/automation/run') {
    try {
      const body = await readJsonBody<{ confirmed?: unknown }>(request)
      if (body.confirmed !== true) throw new RequestInputError('Confirm the bounded maintenance run.')
      const result = await runMaintenance({
        db: env.DB, now: () => new Date(), createId: () => crypto.randomUUID(), fetch,
        ordinaryAccountLifecycle: ordinaryLifecycleMaintenanceConfiguration(env, new URL(request.url).origin),
      }, { trigger: 'operator-run-now', operatorTenureId: actor.tenureNumber })
      return json(result)
    } catch (runError) {
      return respondToActionError(runError, 'Maintenance could not be run.')
    }
  }

  const automationJobCircuitMatch = path.match(/^\/api\/operator\/automation\/jobs\/([^/]+)\/circuit$/)
  if (automationJobCircuitMatch && request.method === 'POST') {
    try {
      const body = await readJsonBody<{ reason?: unknown }>(request)
      if (typeof body.reason !== 'string') throw new RequestInputError('Explain why the circuit is being reset.')
      await resetMaintenanceJobCircuit(env.DB, {
        jobKey: decodeURIComponent(automationJobCircuitMatch[1]), reason: body.reason,
        actor, now: now.toISOString(),
      })
      return json({ ok: true })
    } catch (jobError) {
      return respondToActionError(jobError, 'Maintenance job circuit could not be reset.')
    }
  }

  const automationJobMatch = path.match(/^\/api\/operator\/automation\/jobs\/([^/]+)$/)
  if (automationJobMatch && request.method === 'PUT') {
    try {
      const body = await readJsonBody<{
        enabled?: unknown; batchSize?: unknown; intervalSeconds?: unknown; reason?: unknown
      }>(request)
      if (typeof body.enabled !== 'boolean' || !Number.isInteger(body.batchSize)
        || !Number.isInteger(body.intervalSeconds) || typeof body.reason !== 'string') {
        throw new RequestInputError('Choose a supported enabled state, batch size, cadence, and reason.')
      }
      await updateMaintenanceJob(env.DB, {
        jobKey: decodeURIComponent(automationJobMatch[1]), enabled: body.enabled,
        batchSize: body.batchSize as number, intervalSeconds: body.intervalSeconds as number,
        reason: body.reason, actor, now: now.toISOString(),
      })
      return json({ ok: true })
    } catch (jobError) {
      return respondToActionError(jobError, 'Maintenance job configuration could not be updated.')
    }
  }

  const sourceApprovalMatch = path.match(/^\/api\/operator\/automation\/sources\/([^/]+)\/approve$/)
  if (sourceApprovalMatch && request.method === 'POST') {
    try {
      const body = await readJsonBody<{
        mode?: unknown; intervalSeconds?: unknown; maximumResponseBytes?: unknown
        maximumRedirects?: unknown; reason?: unknown
      }>(request)
      if ((body.mode !== 'availability-metadata' && body.mode !== 'bounded-fingerprint')
        || !Number.isInteger(body.intervalSeconds) || !Number.isInteger(body.maximumResponseBytes)
        || !Number.isInteger(body.maximumRedirects) || typeof body.reason !== 'string') {
        throw new RequestInputError('Choose supported Source Monitor limits and provide a reason.')
      }
      await approveSourceMonitor(env.DB, {
        sourceDocumentId: decodeURIComponent(sourceApprovalMatch[1]), mode: body.mode,
        intervalSeconds: body.intervalSeconds as number,
        maximumResponseBytes: body.maximumResponseBytes as number,
        maximumRedirects: body.maximumRedirects as number,
        reason: body.reason, actor, now: now.toISOString(),
      })
      return json({ ok: true }, { status: 201 })
    } catch (approvalError) {
      return respondToActionError(approvalError, 'The Source Monitor could not be approved.')
    }
  }

  const sourceStateMatch = path.match(/^\/api\/operator\/automation\/sources\/([^/]+)\/state$/)
  if (sourceStateMatch && request.method === 'PUT') {
    try {
      const body = await readJsonBody<{ action?: unknown; reason?: unknown }>(request)
      if (!['enable', 'disable', 'reset-circuit'].includes(body.action as string) || typeof body.reason !== 'string') {
        throw new RequestInputError('Choose enable, disable, or reset circuit and provide a reason.')
      }
      await setSourceMonitorState(env.DB, {
        sourceDocumentId: decodeURIComponent(sourceStateMatch[1]),
        action: body.action as 'enable' | 'disable' | 'reset-circuit',
        reason: body.reason, actor, now: now.toISOString(),
      })
      return json({ ok: true })
    } catch (stateError) {
      return respondToActionError(stateError, 'The Source Monitor state could not be updated.')
    }
  }

  const candidateReviewMatch = path.match(/^\/api\/operator\/automation\/candidates\/([^/]+)$/)
  if (candidateReviewMatch && request.method === 'PUT') {
    try {
      const body = await readJsonBody<{ action?: unknown; reason?: unknown }>(request)
      if (!['review', 'no-material-change', 'supersede', 'dismiss'].includes(body.action as string)
        || typeof body.reason !== 'string') {
        throw new RequestInputError('Choose a supported review action and provide a reason.')
      }
      await reviewAutomatedUpdateCandidate(env.DB, {
        candidateId: decodeURIComponent(candidateReviewMatch[1]),
        action: body.action as 'review' | 'no-material-change' | 'supersede' | 'dismiss',
        reason: body.reason, actor, now: now.toISOString(),
      })
      return json({ ok: true })
    } catch (candidateError) {
      return respondToActionError(candidateError, 'The Automated Update Draft could not be reviewed.')
    }
  }

  const alertReviewMatch = path.match(/^\/api\/operator\/automation\/alerts\/([^/]+)$/)
  if (alertReviewMatch && request.method === 'PUT') {
    try {
      const body = await readJsonBody<{ action?: unknown; reason?: unknown }>(request)
      if ((body.action !== 'acknowledged' && body.action !== 'resolved') || typeof body.reason !== 'string') {
        throw new RequestInputError('Choose acknowledge or resolve and provide a reason.')
      }
      await reviewAutomationAlert(env.DB, {
        alertId: decodeURIComponent(alertReviewMatch[1]), action: body.action,
        reason: body.reason, actor, now: now.toISOString(),
      })
      return json({ ok: true })
    } catch (alertError) {
      return respondToActionError(alertError, 'The Automation Alert could not be reviewed.')
    }
  }

  if (request.method === 'GET' && path === '/api/operator/snapshot') {
    const [auditRows, recordPage, conflicts, brokenSources, coverageGaps, freshnessQueue, countRows] = await Promise.all([
      env.DB.prepare('SELECT id, stable_scope_id record_id, action, actor_label, reason, created_at FROM content_audit_events ORDER BY id DESC LIMIT 50').all<AuditRow>(),
      listOperatorRecords(env.DB, new URLSearchParams()),
      getConflicts(env.DB),
      getBrokenSources(env.DB),
      getCoverageGaps(env.DB),
      getFreshnessQueue(env.DB),
      env.DB.prepare('SELECT kind, COUNT(*) count FROM content_records GROUP BY kind').all<{ kind: ContentRecord['kind']; count: number }>(),
    ])
    const records = recordPage.records
    const audit: AuditEvent[] = auditRows.results.map((row) => ({
      id: row.id,
      recordId: row.record_id,
      action: row.action,
      actorLabel: row.actor_label,
      reason: row.reason,
      createdAt: row.created_at,
    }))
    const snapshot: OperatorSnapshot = {
      records,
      recordsNextCursor: recordPage.nextCursor,
      counts: countRows.results.reduce((counts, row) => ({ ...counts, [row.kind]: row.count }), {
        outpost: 0, event: 0, advancement: 0, organization: 0, page: 0,
      }),
      generatedAt: new Date().toISOString(),
      audit,
      operatorLabel: actor.label,
      conflicts,
      brokenSources,
      coverageGaps,
      freshnessQueue,
    }
    return json(snapshot)
  }

  if (request.method === 'GET' && path === '/api/operator/records') {
    try {
      return json(await listOperatorRecords(env.DB, url.searchParams))
    } catch (queryError) {
      return error(queryError instanceof Error ? queryError.message : 'The listing request is invalid.')
    }
  }

  if (request.method === 'GET' && path === '/api/operator/audit') {
    try {
      const limit = readPageSize(url.searchParams)
      const cursor = url.searchParams.get('cursor')
      const cursorId = cursor ? decodeCursor(cursor, 1)[0] : null
      if (cursorId !== null && typeof cursorId !== 'number') throw new CursorInputError('The page cursor is invalid.')
      const rows = await env.DB.prepare(`SELECT id, stable_scope_id record_id, action, actor_label, reason, created_at
        FROM content_audit_events WHERE (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ?`)
        .bind(cursorId, cursorId, limit + 1).all<AuditRow>()
      const items = rows.results.slice(0, limit).map((row) => ({
        id: row.id, recordId: row.record_id, action: row.action, actorLabel: row.actor_label,
        reason: row.reason, createdAt: row.created_at,
      }))
      return json({ items, nextCursor: rows.results.length > limit && items.length ? encodeCursor([items.at(-1)!.id]) : null })
    } catch (queryError) {
      return error(queryError instanceof Error ? queryError.message : 'The audit page is invalid.')
    }
  }

  if (request.method === 'GET' && path === '/api/operator/submissions') {
    try {
      return json(await listDirectorySubmissions(env.DB, url.searchParams))
    } catch (queryError) {
      return respondToActionError(queryError, 'The proposal queue could not be loaded.')
    }
  }

  if (request.method === 'GET' && path === '/api/operator/population/report') {
    return json(await getPopulationReport(env.DB))
  }

  if (request.method === 'GET' && path === '/api/operator/population/candidates') {
    try {
      return json(await listStagedOutpostCandidates(env.DB, url.searchParams))
    } catch (listError) {
      return respondToActionError(listError, 'The staged-candidate queue could not be loaded.')
    }
  }

  if (request.method === 'POST' && path === '/api/operator/population/stage') {
    try {
      const body = await readJsonBody<{ manifest?: unknown }>(request)
      const result = await stageOutpostManifest(env.DB, body.manifest, actor, now.toISOString())
      return json(result, { status: result.idempotent ? 200 : 201 })
    } catch (stageError) {
      return respondToActionError(stageError, 'The reviewed population batch could not be staged.')
    }
  }

  const populationApplyMatch = path.match(/^\/api\/operator\/population\/candidates\/([^/]+)\/apply$/)
  if (populationApplyMatch && request.method === 'POST') {
    try {
      const body = await readJsonBody<{
        expectedVersion?: number | null
        duplicateDecision?: 'confirmed-correction' | 'no-match' | null
        reason?: string
      }>(request)
      const id = await applyStagedOutpostCandidate(env.DB, {
        candidateId: decodeURIComponent(populationApplyMatch[1]), expectedVersion: body.expectedVersion ?? null,
        duplicateDecision: body.duplicateDecision ?? null, reason: body.reason?.trim() ?? '', actor,
        now: now.toISOString(),
      })
      return json({ id }, { status: 201 })
    } catch (applyError) {
      return respondToActionError(applyError, 'The staged candidate could not be converted to a draft.')
    }
  }

  const submissionDetailMatch = path.match(/^\/api\/operator\/submissions\/([^/]+)$/)
  if (submissionDetailMatch && request.method === 'GET') {
    const item = await getDirectorySubmission(env.DB, submissionDetailMatch[1])
    return item ? json({ item }) : error('Proposal not found.', 404)
  }

  const submissionConvertMatch = path.match(/^\/api\/operator\/submissions\/([^/]+)\/convert$/)
  if (submissionConvertMatch && request.method === 'POST') {
    try {
      const body = await readJsonBody<{
        verifiedFields?: unknown; sourceLabel?: string; checkedAt?: string; reason?: string; expectedVersion?: number | null
      }>(request)
      if (!Array.isArray(body.verifiedFields) || body.verifiedFields.some((field) => typeof field !== 'string')) {
        throw new Error('Choose the fields verified against the Source Document.')
      }
      const id = await convertDirectorySubmissionToDraft(env.DB, {
        submissionId: submissionConvertMatch[1], verifiedFields: body.verifiedFields,
        sourceLabel: body.sourceLabel?.trim() ?? '', checkedAt: body.checkedAt?.trim() ?? '',
        reason: body.reason?.trim() ?? '', expectedVersion: body.expectedVersion ?? null,
        actor, now: now.toISOString(),
      })
      return json({ id }, { status: 201 })
    } catch (actionError) {
      return respondToActionError(actionError, 'The proposal could not be converted to a draft.')
    }
  }

  const submissionActionMatch = path.match(/^\/api\/operator\/submissions\/([^/]+)\/(triage|needs-information|duplicate|verified-ready|reject|withdraw|scrub)$/)
  if (submissionActionMatch && request.method === 'POST') {
    try {
      const body = await readJsonBody<{ reason?: string; relatedOutpostId?: string | null }>(request)
      const input = {
        id: submissionActionMatch[1], reason: body.reason?.trim() ?? '', actor, now: now.toISOString(),
      }
      if (submissionActionMatch[2] === 'scrub') await scrubDirectorySubmission(env.DB, input)
      else await transitionDirectorySubmission(env.DB, {
        ...input, action: submissionActionMatch[2], relatedOutpostId: body.relatedOutpostId?.trim() || null,
      })
      return json({ ok: true })
    } catch (actionError) {
      return respondToActionError(actionError, 'The proposal action could not be completed.')
    }
  }

  const outpostLifecycleMatch = path.match(/^\/api\/operator\/outposts\/([^/]+)\/lifecycle$/)
  if (outpostLifecycleMatch && request.method === 'POST') {
    try {
      const body = await readJsonBody<{
        action?: 'grace' | 'expire' | 'archive'; reason?: string; archiveSourceId?: string; effectiveAt?: string
      }>(request)
      if (body.action !== 'grace' && body.action !== 'expire' && body.action !== 'archive') {
        throw new Error('Choose grace, expire, or archive.')
      }
      await updateOutpostLifecycle(env.DB, {
        outpostId: outpostLifecycleMatch[1], action: body.action, reason: body.reason?.trim() ?? '',
        archiveSourceId: body.archiveSourceId, effectiveAt: body.effectiveAt, actor, now: now.toISOString(),
      })
      return json({ ok: true })
    } catch (actionError) {
      return respondToActionError(actionError, 'The Outpost lifecycle action could not be completed.')
    }
  }

  if (request.method === 'GET' && path === '/api/operator/freshness') return json({ items: await getFreshnessQueue(env.DB) })
  if (request.method === 'GET' && path === '/api/operator/conflicts') return json({ items: await getConflicts(env.DB) })
  if (request.method === 'GET' && path === '/api/operator/broken-sources') return json({ items: await getBrokenSources(env.DB) })
  if (request.method === 'GET' && path === '/api/operator/coverage-gaps') return json({ items: await getCoverageGaps(env.DB) })

  const operatorDetailMatch = path.match(/^\/api\/operator\/records\/([^/]+)$/)
  if (operatorDetailMatch && request.method === 'GET') {
    const record = await getOperatorRecord(env.DB, operatorDetailMatch[1])
    return record ? json({ record }) : error('Record not found.', 404)
  }

  const sourceActionMatch = path.match(/^\/api\/operator\/sources\/([^/]+)\/(reverify|broken)$/)
  if (sourceActionMatch && request.method === 'POST') {
    const [, sourceId, action] = sourceActionMatch
    const source = await env.DB.prepare(`SELECT provenance.id, provenance.content_id record_id,
      provenance.field_path field_name, provenance.source_label label, document.url,
      provenance.verified_at FROM field_provenance provenance
      JOIN source_documents document ON document.id = provenance.source_document_id
      WHERE provenance.id = ?`).bind(sourceId).first<SourceRow>()
    if (!source) return error('Source not found.', 404)
    const now = new Date().toISOString()
    if (action === 'reverify') {
      await env.DB.batch([
        env.DB.prepare('UPDATE field_provenance SET verified_at = ? WHERE id = ?').bind(now, sourceId),
        env.DB.prepare(`INSERT INTO content_audit_events
          (content_id, stable_scope_id, action, actor_label, before_json, after_json, reason, created_at, operator_tenure_id)
          VALUES (?, ?, 'source reverified', ?, ?, ?, ?, ?, ?)`).bind(
          source.record_id, source.record_id, actor.label, JSON.stringify(source),
          JSON.stringify({ ...source, verified_at: now }), `Reverified ${source.field_name} source`, now,
          actor.tenureNumber,
        ),
      ])
      return json({ ok: true })
    }
    try {
      const body = await readJsonBody<{ broken?: boolean; note?: string }>(request)
      if (body.broken) {
        if (!body.note?.trim()) throw new Error('Describe the observed source problem.')
        const active = await env.DB.prepare('SELECT id FROM source_health_observations WHERE provenance_id = ? AND cleared_at IS NULL').bind(sourceId).first<{ id: string }>()
        if (active) throw new Error('This source already has an active broken-source observation.')
        const id = crypto.randomUUID()
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO source_health_observations
            (id, provenance_id, source_document_id, content_id, observed_at, observed_by, note,
             observed_operator_tenure_id)
            SELECT ?, provenance.id, provenance.source_document_id, provenance.content_id, ?, ?, ?, ?
            FROM field_provenance provenance WHERE provenance.id = ?`)
            .bind(id, now, actor.label, body.note.trim(), actor.tenureNumber, sourceId),
          env.DB.prepare(`INSERT INTO content_audit_events
            (content_id, stable_scope_id, action, actor_label, after_json, reason, created_at, operator_tenure_id)
            VALUES (?, ?, 'broken source recorded', ?, ?, ?, ?, ?)`).bind(
            source.record_id, source.record_id, actor.label, JSON.stringify({ sourceId, observationId: id }),
            body.note.trim(), now, actor.tenureNumber,
          ),
        ])
      } else {
        const active = await env.DB.prepare(`SELECT id, provenance_id source_id, content_id record_id,
          observed_at, observed_by, note, cleared_at, cleared_by FROM source_health_observations
          WHERE provenance_id = ? AND cleared_at IS NULL ORDER BY observed_at DESC LIMIT 1`)
          .bind(sourceId).first<BrokenSourceRow>()
        if (!active) throw new Error('This source has no active broken-source observation.')
        if (!body.note?.trim()) throw new Error('Explain why the broken-source observation can be cleared.')
        await env.DB.batch([
          env.DB.prepare(`UPDATE source_health_observations SET cleared_at = ?, cleared_by = ?,
            cleared_operator_tenure_id = ? WHERE id = ?`)
            .bind(now, actor.label, actor.tenureNumber, active.id),
          env.DB.prepare(`INSERT INTO content_audit_events
            (content_id, stable_scope_id, action, actor_label, before_json, after_json, reason, created_at, operator_tenure_id)
            VALUES (?, ?, 'broken source cleared', ?, ?, ?, ?, ?, ?)`).bind(
            source.record_id, source.record_id, actor.label, JSON.stringify(active),
            JSON.stringify({ ...active, cleared_at: now, cleared_by: actor.label }), body.note.trim(), now,
            actor.tenureNumber,
          ),
        ])
      }
      return json({ ok: true })
    } catch (actionError) {
      return respondToActionError(actionError, 'Could not update source state.')
    }
  }

  const lifecycleMatch = path.match(/^\/api\/operator\/events\/([^/]+)\/lifecycle$/)
  if (lifecycleMatch && request.method === 'POST') {
    try {
      const body = await readJsonBody<{ status?: unknown; reason?: string }>(request)
      if (!eventLifecycleStatuses.includes(body.status as EventDetails['lifecycleStatus'])) throw new Error('Choose a valid event lifecycle status.')
      if (!body.reason?.trim()) throw new Error('Explain the lifecycle change.')
      const previous = await getOperatorRecord(env.DB, lifecycleMatch[1])
      if (!previous || previous.kind !== 'event') return error('Event not found.', 404)
      await saveNormalizedRecord(env.DB, previous.id, {
        ...previous,
        details: { ...(previous.details as EventDetails), lifecycleStatus: body.status as EventDetails['lifecycleStatus'] },
      }, actor, body.reason.trim(), previous, previous.version ?? null)
      return json({ ok: true })
    } catch (actionError) {
      return respondToActionError(actionError, 'Could not update lifecycle.')
    }
  }

  if (path === '/api/operator/conflicts' && request.method === 'POST') {
    try {
      const body = await readJsonBody<{ eventId?: string; fieldName?: string; assertions?: EventConflictAssertion[]; reason?: string }>(request)
      if (!body.eventId || !body.fieldName?.trim()) throw new Error('Choose an event and disputed field.')
      if (!Array.isArray(body.assertions) || body.assertions.length < 2 || body.assertions.some((assertion) => !assertion.sourceLabel?.trim() || !assertion.assertedValue?.trim())) {
        throw new Error('Provide at least two labelled conflicting source assertions.')
      }
      const eventRecord = await env.DB.prepare("SELECT id FROM content_records WHERE id = ? AND kind = 'event'").bind(body.eventId).first<{ id: string }>()
      if (!eventRecord) throw new Error('Event not found.')
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const statements = [
        env.DB.prepare(`INSERT INTO normalized_event_conflicts
          (id, occurrence_id, field_path, status, opened_at, opened_by, opened_operator_tenure_id)
          VALUES (?, ?, ?, 'open', ?, ?, ?)`)
          .bind(id, body.eventId, body.fieldName.trim(), now, actor.label, actor.tenureNumber),
      ]
      body.assertions.forEach((assertion, order) => statements.push(
        env.DB.prepare(`INSERT INTO event_conflict_assertions
          (id, conflict_id, provenance_id, source_label, asserted_value, display_order)
          VALUES (?, ?, (SELECT id FROM field_provenance WHERE id = ?), ?, ?, ?)`)
          .bind(`${id}:${order}`, id, assertion.sourceId, assertion.sourceLabel.trim(), assertion.assertedValue.trim(), order),
      ))
      statements.push(env.DB.prepare(`INSERT INTO content_audit_events
        (content_id, stable_scope_id, action, actor_label, after_json, reason, created_at, operator_tenure_id)
        VALUES (?, ?, 'event conflict opened', ?, ?, ?, ?, ?)`).bind(
        body.eventId, body.eventId, actor.label, JSON.stringify({ id, fieldName: body.fieldName }),
        body.reason?.trim() || 'Conflicting event sources recorded', now, actor.tenureNumber,
      ))
      await env.DB.batch(statements)
      return json({ id }, { status: 201 })
    } catch (actionError) {
      return respondToActionError(actionError, 'Could not open event conflict.')
    }
  }

  const conflictMatch = path.match(/^\/api\/operator\/conflicts\/([^/]+)$/)
  if (conflictMatch && request.method === 'PUT') {
    try {
      const body = await readJsonBody<{ resolutionNote?: string }>(request)
      if (!body.resolutionNote?.trim()) throw new Error('A resolution note is required.')
      const previous = await env.DB.prepare(`SELECT conflict.id, conflict.occurrence_id event_id,
        conflict.field_path field_name, conflict.status, conflict.opened_at, conflict.opened_by,
        NULL resolution_note, conflict.resolved_at, conflict.resolved_by, '[]' assertions_json
        FROM normalized_event_conflicts conflict WHERE conflict.id = ?`).bind(conflictMatch[1]).first<ConflictRow>()
      if (!previous) return error('Conflict not found.', 404)
      if (previous.status === 'resolved') throw new Error('This conflict is already resolved.')
      const now = new Date().toISOString()
      await env.DB.batch([
        env.DB.prepare(`UPDATE normalized_event_conflicts SET status = 'resolved', resolved_at = ?,
          resolved_by = ?, resolved_operator_tenure_id = ? WHERE id = ?`)
          .bind(now, actor.label, actor.tenureNumber, conflictMatch[1]),
        env.DB.prepare(`INSERT INTO event_conflict_resolutions
          (conflict_id, resolution_note, resolved_at, resolved_by, operator_tenure_id)
          VALUES (?, ?, ?, ?, ?)`)
          .bind(conflictMatch[1], body.resolutionNote.trim(), now, actor.label, actor.tenureNumber),
        env.DB.prepare(`INSERT INTO content_audit_events
          (content_id, stable_scope_id, action, actor_label, before_json, after_json, reason, created_at, operator_tenure_id)
          VALUES (?, ?, 'event conflict resolved', ?, ?, ?, ?, ?, ?)`).bind(
          previous.event_id, previous.event_id, actor.label, JSON.stringify(toConflict(previous)),
          JSON.stringify({ conflictId: previous.id, status: 'resolved' }), body.resolutionNote.trim(), now,
          actor.tenureNumber,
        ),
      ])
      return json({ ok: true })
    } catch (actionError) {
      return respondToActionError(actionError, 'Could not resolve conflict.')
    }
  }

  if (path === '/api/operator/coverage-gaps' && request.method === 'POST') {
    try {
      const body = await readJsonBody<{ scope?: string; description?: string; sourceUrl?: string | null }>(request)
      if (!body.scope?.trim() || !body.description?.trim()) throw new Error('Scope and coverage-gap description are required.')
      if (body.sourceUrl && !body.sourceUrl.startsWith('https://')) throw new Error('Coverage-gap source URL must be HTTPS.')
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const statements: D1PreparedStatement[] = []
      if (body.sourceUrl) statements.push(
        env.DB.prepare(`INSERT INTO source_documents (id, url, label, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT(url) DO NOTHING`).bind(`document-${crypto.randomUUID()}`, body.sourceUrl, body.scope.trim(), now),
      )
      statements.push(
        env.DB.prepare(`INSERT INTO normalized_coverage_gaps
          (id, scope_text, content_id, organization_id, source_document_id, description,
           last_checked_at, status, created_at, created_by, created_operator_tenure_id)
          VALUES (?, ?, (SELECT id FROM content_records WHERE id = ?),
            (SELECT id FROM organization_units WHERE id = ? OR name = ? LIMIT 1),
            (SELECT id FROM source_documents WHERE url = ?), ?, ?, 'open', ?, ?, ?)`)
          .bind(id, body.scope.trim(), body.scope.trim(), body.scope.trim(), body.scope.trim(),
            body.sourceUrl || null, body.description.trim(), now, now, actor.label, actor.tenureNumber),
        env.DB.prepare(`INSERT INTO content_audit_events
          (stable_scope_id, action, actor_label, after_json, reason, created_at, operator_tenure_id)
          VALUES (?, 'coverage gap recorded', ?, ?, ?, ?, ?)`).bind(
          id, actor.label, JSON.stringify({ id, scope: body.scope }), body.description.trim(), now,
          actor.tenureNumber,
        ),
      )
      await env.DB.batch(statements)
      return json({ id }, { status: 201 })
    } catch (actionError) {
      return respondToActionError(actionError, 'Could not record coverage gap.')
    }
  }

  const coverageGapMatch = path.match(/^\/api\/operator\/coverage-gaps\/([^/]+)$/)
  if (coverageGapMatch && request.method === 'PUT') {
    try {
      const body = await readJsonBody<{ status?: string; reason?: string }>(request)
      if (body.status !== 'resolved' && body.status !== 'dismissed') throw new Error('Choose resolved or dismissed.')
      if (!body.reason?.trim()) throw new Error('A resolution or dismissal reason is required.')
      const previous = await env.DB.prepare(`SELECT gap.id, gap.scope_text scope, gap.description,
        document.url source_url, gap.last_checked_at, gap.status, gap.resolution_reason,
        gap.created_at, gap.created_by, gap.resolved_at, gap.resolved_by
        FROM normalized_coverage_gaps gap LEFT JOIN source_documents document ON document.id = gap.source_document_id
        WHERE gap.id = ?`).bind(coverageGapMatch[1]).first<CoverageGapRow>()
      if (!previous) return error('Coverage gap not found.', 404)
      const now = new Date().toISOString()
      await env.DB.batch([
        env.DB.prepare(`UPDATE normalized_coverage_gaps SET status = ?, resolution_reason = ?,
          resolved_at = ?, resolved_by = ?, resolved_operator_tenure_id = ? WHERE id = ?`)
          .bind(body.status, body.reason.trim(), now, actor.label, actor.tenureNumber, coverageGapMatch[1]),
        env.DB.prepare(`INSERT INTO content_audit_events
          (stable_scope_id, action, actor_label, before_json, after_json, reason, created_at, operator_tenure_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(previous.id, `coverage gap ${body.status}`, actor.label,
          JSON.stringify(toCoverageGap(previous)), JSON.stringify({ id: previous.id, status: body.status }),
          body.reason.trim(), now, actor.tenureNumber),
      ])
      return json({ ok: true })
    } catch (actionError) {
      return respondToActionError(actionError, 'Could not update coverage gap.')
    }
  }

  const recordMatch = path.match(/^\/api\/operator\/records(?:\/([^/]+))?$/)
  if (recordMatch && request.method === 'POST' && !recordMatch[1]) {
    try {
      const body = await readJsonBody<{ record?: unknown; reason?: string }>(request)
      const input = parseEditableRecord(body.record)
      const id = crypto.randomUUID()
      const storedInput = input.kind === 'outpost'
        ? { ...input, details: { ...(input.details as OutpostDetails), hubOutpostId: id } }
        : input
      await saveNormalizedRecord(env.DB, id, storedInput, actor, body.reason?.trim() || 'Created in Operator workspace', null, null)
      return json({ id }, { status: 201 })
    } catch (saveError) {
      return respondToActionError(saveError, 'Could not save record.')
    }
  }

  if (recordMatch?.[1] && request.method === 'PUT') {
    try {
      const body = await readJsonBody<{ record?: unknown; reason?: string; expectedVersion?: number }>(request)
      const input = parseEditableRecord(body.record)
      const previous = await getOperatorRecord(env.DB, recordMatch[1])
      if (!previous) return error('Record not found.', 404)
      await saveNormalizedRecord(
        env.DB,
        recordMatch[1],
        input,
        actor,
        body.reason?.trim() || 'Updated in Operator workspace',
        previous,
        body.expectedVersion ?? null,
      )
      return json({ ok: true })
    } catch (saveError) {
      return respondToActionError(saveError, 'Could not save record.')
    }
  }

  return error('Not found.', 404)
}

function withSecurityHeaders(request: Request, response: Response) {
  const secured = new Response(response.body, response)
  secured.headers.set('x-content-type-options', 'nosniff')
  secured.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  secured.headers.set('x-frame-options', 'DENY')
  secured.headers.set(
    'permissions-policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  )
  secured.headers.set(
    'content-security-policy',
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self' mailto:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; font-src 'self'; manifest-src 'self'; worker-src 'self'",
  )
  const url = new URL(request.url)
  if (isOrdinaryAccountRoute(url.pathname)) {
    secured.headers.set('cache-control', 'private, no-store')
    secured.headers.set('pragma', 'no-cache')
    secured.headers.set('referrer-policy', 'no-referrer')
  }
  if (url.protocol === 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    secured.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains')
  }
  return secured
}

const ordinaryAccountPageRoutes = new Set([
  '/signup', '/sign-in', '/forgot-password', '/reset-password', '/account', '/workspace',
])

function isOrdinaryAccountRoute(path: string) {
  return path.startsWith('/api/auth/') || path.startsWith('/api/account/')
    || path === '/api/workspace' || path.startsWith('/api/workspace/')
    || ordinaryAccountPageRoutes.has(path)
}

function routeCategory(path: string) {
  if (path === '/api/health') return 'health'
  if (path === '/operator' || path.startsWith('/operator/') || path.startsWith('/api/operator/')) return 'operator'
  if (isOrdinaryAccountRoute(path)) return 'ordinary-account'
  if (path === '/api/public' || path.startsWith('/api/public/') || path === '/api/search') return 'public-api'
  if (path.startsWith('/api/')) return 'api'
  return 'asset'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const startedAt = Date.now()
    const requestId = crypto.randomUUID()
    const path = new URL(request.url).pathname
    let status = 500
    try {
      const response = path.startsWith('/api/')
        ? await handleApi(request, env, requestId)
        : await env.ASSETS.fetch(request)
      const secured = withSecurityHeaders(request, response)
      secured.headers.set('x-request-id', requestId)
      status = secured.status
      return secured
    } finally {
      console.log(JSON.stringify({
        event: 'request',
        requestId,
        routeCategory: routeCategory(path),
        status,
        durationMs: Date.now() - startedAt,
      }))
    }
  },
  scheduled(controller: ScheduledController, env: Env, context: ExecutionContext) {
    const correlationId = crypto.randomUUID()
    const scheduledAt = new Date(controller.scheduledTime)
    const runtimeStartedAt = Date.now()
    const promise = runMaintenance({
      db: env.DB,
      now: () => new Date(scheduledAt.valueOf() + Date.now() - runtimeStartedAt),
      createId: () => crypto.randomUUID(),
      fetch,
      ordinaryAccountLifecycle: ordinaryLifecycleMaintenanceConfiguration(env),
    }, { trigger: 'cron' }).then((outcome) => {
      console.log(JSON.stringify({
        event: 'maintenance', correlationId, trigger: 'cron', status: outcome.status,
        jobsClaimed: outcome.jobsClaimed, actionsApplied: outcome.actionsApplied,
        failedTasks: outcome.failedTasks, outboundSubrequests: outcome.outboundSubrequests,
        fetchedBytes: outcome.fetchedBytes,
      }))
      return outcome
    }).catch(() => {
      console.error(JSON.stringify({ event: 'maintenance', correlationId, trigger: 'cron', status: 'failed' }))
      throw new Error('Scheduled maintenance failed safely.')
    })
    context.waitUntil(promise)
  },
} satisfies ExportedHandler<Env>
