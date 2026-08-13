import {
  directorySubmissionTypes,
  fcfActivityStatuses,
  submissionFingerprint,
  submissionRetentionDeadline,
  validateDirectorySubmission,
  type DirectorySubmissionInput,
} from '../shared/us-directory'

const INTAKE_ACTION = 'outpost-submission'
const MAX_BODY_BYTES = 12_000
const MIN_COMPLETION_MILLISECONDS = 2_000
const MAX_FORM_AGE_MILLISECONDS = 2 * 60 * 60 * 1_000

export type PublicIntakeEnv = {
  DB: D1Database
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY?: string
  TURNSTILE_EXPECTED_HOSTNAMES?: string
  INTAKE_SIGNING_SECRET?: string
  LOCAL_PUBLIC_INTAKE_BYPASS?: string
}

type PublicSubmissionBody = {
  proposal?: unknown
  challengeToken?: unknown
  timingToken?: unknown
  website?: unknown
}

class IntakeError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } })
}

function exactLoopback(url: URL) {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
}

function expectedHostnames(env: PublicIntakeEnv) {
  return (env.TURNSTILE_EXPECTED_HOSTNAMES ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
}

function intakeConfiguration(request: Request, env: PublicIntakeEnv) {
  const url = new URL(request.url)
  const signingSecret = env.INTAKE_SIGNING_SECRET?.trim() ?? ''
  const localBypass = env.LOCAL_PUBLIC_INTAKE_BYPASS === 'true' && exactLoopback(url) && signingSecret.length >= 32
  const hostnames = expectedHostnames(env)
  const production = Boolean(
    env.TURNSTILE_SITE_KEY?.trim()
    && env.TURNSTILE_SECRET_KEY?.trim()
    && signingSecret.length >= 32
    && hostnames.includes(url.hostname.toLowerCase()),
  )
  return { enabled: localBypass || production, localBypass, hostnames, signingSecret }
}

function base64Url(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function signTimingValue(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))))
}

async function timingToken(secret: string, now: number) {
  const value = String(now)
  return `${value}.${await signTimingValue(value, secret)}`
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

async function verifyTimingToken(token: unknown, secret: string, now: number) {
  if (typeof token !== 'string' || token.length > 200) return false
  const [issuedValue, suppliedSignature, extra] = token.split('.')
  if (!issuedValue || !suppliedSignature || extra) return false
  const issuedAt = Number(issuedValue)
  if (!Number.isSafeInteger(issuedAt)) return false
  const age = now - issuedAt
  if (age < MIN_COMPLETION_MILLISECONDS || age > MAX_FORM_AGE_MILLISECONDS) return false
  return constantTimeEqual(suppliedSignature, await signTimingValue(issuedValue, secret))
}

function parseProposal(value: unknown): DirectorySubmissionInput {
  if (!value || typeof value !== 'object') throw new IntakeError('Check the highlighted proposal fields.', 400, 'invalid-proposal')
  const input = value as Partial<DirectorySubmissionInput>
  const proposal = {
    submissionType: input.submissionType,
    targetOutpostId: typeof input.targetOutpostId === 'string' ? input.targetOutpostId.trim() || null : null,
    church: typeof input.church === 'string' ? input.church : '',
    outpostNumber: typeof input.outpostNumber === 'string' ? input.outpostNumber.trim() || null : null,
    campusSuffix: typeof input.campusSuffix === 'string' ? input.campusSuffix.trim() || null : null,
    streetAddress: typeof input.streetAddress === 'string' ? input.streetAddress.trim() || null : null,
    city: typeof input.city === 'string' ? input.city : '',
    jurisdiction: typeof input.jurisdiction === 'string' ? input.jurisdiction : '',
    postalCode: typeof input.postalCode === 'string' ? input.postalCode.trim() || null : null,
    district: typeof input.district === 'string' ? input.district.trim() || null : null,
    languageOverlay: typeof input.languageOverlay === 'string' ? input.languageOverlay.trim() || null : null,
    programs: Array.isArray(input.programs) ? input.programs : [],
    meeting: typeof input.meeting === 'string' ? input.meeting.trim() || null : null,
    sourceUrl: typeof input.sourceUrl === 'string' ? input.sourceUrl.trim() : '',
    fcfActivityStatus: input.fcfActivityStatus,
    replyEmail: typeof input.replyEmail === 'string' ? input.replyEmail.trim() : '',
    notes: typeof input.notes === 'string' ? input.notes.trim() || null : null,
    privacyConfirmed: input.privacyConfirmed === true,
  }
  if (!directorySubmissionTypes.includes(proposal.submissionType as DirectorySubmissionInput['submissionType'])) {
    proposal.submissionType = 'new-listing'
  }
  if (!fcfActivityStatuses.includes(proposal.fcfActivityStatus as DirectorySubmissionInput['fcfActivityStatus'])) {
    proposal.fcfActivityStatus = 'not-verified'
  }
  const typed = proposal as DirectorySubmissionInput
  const errors = validateDirectorySubmission(typed)
  if (Object.keys(errors).length) {
    throw new IntakeError('Check the highlighted proposal fields.', 400, 'invalid-proposal')
  }
  return typed
}

async function verifyTurnstile(token: unknown, env: PublicIntakeEnv, hostnames: string[]) {
  if (typeof token !== 'string' || token.length < 1 || token.length > 2_048) {
    throw new IntakeError('Complete the human-verification check and try again.', 400, 'challenge-failed')
  }
  const form = new FormData()
  form.set('secret', env.TURNSTILE_SECRET_KEY as string)
  form.set('response', token)
  form.set('idempotency_key', crypto.randomUUID())
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: form, signal: controller.signal,
    })
    if (!response.ok) throw new Error('Siteverify unavailable')
    const result = await response.json() as { success?: unknown; hostname?: unknown; action?: unknown }
    if (result.success !== true || result.action !== INTAKE_ACTION
      || typeof result.hostname !== 'string' || !hostnames.includes(result.hostname.toLowerCase())) {
      throw new Error('Siteverify rejected')
    }
  } catch {
    throw new IntakeError('Human verification failed. Try a fresh check or use the email fallback.', 400, 'challenge-failed')
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

function referenceCode() {
  return `ROH-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`
}

async function acceptProposal(db: D1Database, proposal: DirectorySubmissionInput, now: string) {
  const id = crypto.randomUUID()
  const reference = referenceCode()
  const fingerprint = await submissionFingerprint(proposal)
  const statements = [
    db.prepare(`INSERT INTO directory_submissions
      (id, reference_code, submission_type, target_outpost_id, church, external_number, campus_suffix,
       street_address, city, civil_geography_id, postal_code, district_name, language_overlay_name,
       program_groups_text, meeting_information, source_url, fcf_activity_status, reply_email,
       private_notes, identity_fingerprint, state, retention_deadline, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, geography.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?
      FROM civil_geographies geography
      WHERE geography.country_code = 'US' AND geography.name = ?`)
      .bind(
        id, reference, proposal.submissionType, proposal.targetOutpostId, proposal.church.trim(), proposal.outpostNumber,
        proposal.campusSuffix, proposal.streetAddress, proposal.city.trim(), proposal.postalCode, proposal.district,
        proposal.languageOverlay, proposal.programs.join('\u001f'), proposal.meeting, proposal.sourceUrl,
        proposal.fcfActivityStatus, proposal.replyEmail, proposal.notes, fingerprint,
        submissionRetentionDeadline(now), now, now, proposal.jurisdiction,
      ),
    db.prepare(`INSERT INTO directory_submission_events (submission_id, action, created_at)
      SELECT id, 'received', ? FROM directory_submissions WHERE id = ?`).bind(now, id),
    db.prepare(`INSERT OR IGNORE INTO directory_candidate_matches
      (id, submission_id, outpost_id, match_kind, evidence_summary, state, created_at)
      SELECT ?, ?, outpost.content_id, 'church-location',
        'Normalized church, city, and jurisdiction candidate match', 'candidate', ?
      FROM outposts outpost JOIN civil_geographies geography ON geography.id = outpost.civil_geography_id
      WHERE lower(trim(outpost.church)) = lower(trim(?)) AND lower(trim(outpost.city)) = lower(trim(?))
        AND geography.name = ? LIMIT 1`)
      .bind(`${id}:church-location`, id, now, proposal.church, proposal.city, proposal.jurisdiction),
    db.prepare(`INSERT OR IGNORE INTO directory_candidate_matches
      (id, submission_id, outpost_id, match_kind, evidence_summary, state, created_at)
      SELECT ?, ?, outpost.content_id, 'scoped-number',
        'Displayed number, district, and campus candidate match', 'candidate', ?
      FROM outposts outpost WHERE outpost.external_number = ?
        AND COALESCE(outpost.campus_suffix, '') = COALESCE(?, '')
        AND (? IS NULL OR EXISTS (SELECT 1 FROM outpost_affiliations affiliation
          JOIN organization_units unit ON unit.id = affiliation.organization_id
          WHERE affiliation.outpost_id = outpost.content_id AND unit.name = ?)) LIMIT 1`)
      .bind(`${id}:scoped-number`, id, now, proposal.outpostNumber, proposal.campusSuffix,
        proposal.district, proposal.district),
    db.prepare(`INSERT OR IGNORE INTO directory_candidate_matches
      (id, submission_id, outpost_id, match_kind, evidence_summary, state, created_at)
      SELECT ?, ?, outpost.content_id, 'address', 'Normalized public church address candidate match',
        'candidate', ? FROM outposts outpost JOIN civil_geographies geography
        ON geography.id = outpost.civil_geography_id
      WHERE ? IS NOT NULL AND lower(trim(outpost.street_address)) = lower(trim(?))
        AND geography.name = ? LIMIT 1`)
      .bind(`${id}:address`, id, now, proposal.streetAddress, proposal.streetAddress, proposal.jurisdiction),
    db.prepare(`INSERT OR IGNORE INTO directory_candidate_matches
      (id, submission_id, outpost_id, match_kind, evidence_summary, state, created_at)
      SELECT ?, ?, provenance.content_id, 'source-url', 'Exact Source Document URL candidate match',
        'candidate', ? FROM field_provenance provenance JOIN source_documents document
        ON document.id = provenance.source_document_id JOIN outposts outpost
        ON outpost.content_id = provenance.content_id WHERE document.url = ? LIMIT 1`)
      .bind(`${id}:source-url`, id, now, proposal.sourceUrl),
    db.prepare(`UPDATE directory_submissions SET likely_duplicate =
      EXISTS (SELECT 1 FROM directory_candidate_matches match
        WHERE match.submission_id = directory_submissions.id AND match.state = 'candidate')
      WHERE id = ?`).bind(id),
  ]
  try {
    await db.batch(statements)
  } catch (errorValue) {
    const message = errorValue instanceof Error ? errorValue.message : String(errorValue)
    if (!message.includes('directory_submissions.identity_fingerprint')) throw errorValue
  }
  return reference
}

export async function handlePublicOutpostIntake(request: Request, env: PublicIntakeEnv) {
  const configuration = intakeConfiguration(request, env)
  if (request.method === 'GET') {
    const options = await env.DB.prepare(`SELECT name, unit_type FROM organization_units
      WHERE unit_type IN ('district', 'language-district') ORDER BY unit_type, name`).all<{
      name: string; unit_type: 'district' | 'language-district'
    }>()
    const publicOptions = {
      districts: options.results.filter((row) => row.unit_type === 'district').map((row) => row.name),
      languageOverlays: options.results.filter((row) => row.unit_type === 'language-district').map((row) => row.name),
    }
    if (!configuration.enabled) return json({ enabled: false, ...publicOptions })
    return json({
      enabled: true,
      siteKey: configuration.localBypass ? null : env.TURNSTILE_SITE_KEY,
      action: INTAKE_ACTION,
      timingToken: await timingToken(configuration.signingSecret, Date.now()),
      ...publicOptions,
    })
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  if (!configuration.enabled) {
    return json({
      error: 'Secure online intake is unavailable. Prepare an email or copy the proposal instead.',
      code: 'intake-unavailable',
    }, 503)
  }
  try {
    const url = new URL(request.url)
    if (request.headers.get('origin') !== url.origin) throw new IntakeError('The request origin is not allowed.', 403, 'wrong-origin')
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      throw new IntakeError('Send the proposal as JSON.', 415, 'wrong-content-type')
    }
    const declaredLength = Number(request.headers.get('content-length') ?? 0)
    if (declaredLength > MAX_BODY_BYTES) throw new IntakeError('The proposal is too large.', 413, 'body-too-large')
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new IntakeError('The proposal is too large.', 413, 'body-too-large')
    let body: PublicSubmissionBody
    try {
      body = JSON.parse(text) as PublicSubmissionBody
    } catch {
      throw new IntakeError('Request body must be valid JSON.', 400, 'invalid-json')
    }
    if (typeof body.website !== 'string' || body.website.length > 0) throw new IntakeError('The proposal could not be accepted.', 400, 'invalid-proposal')
    if (!await verifyTimingToken(body.timingToken, configuration.signingSecret, Date.now())) {
      throw new IntakeError('The form was completed too quickly or has expired. Reload it and try again.', 400, 'invalid-timing')
    }
    if (!configuration.localBypass) await verifyTurnstile(body.challengeToken, env, configuration.hostnames)
    const proposal = parseProposal(body.proposal)
    const reference = await acceptProposal(env.DB, proposal, new Date().toISOString())
    return json({ status: 'received', referenceCode: reference }, 202)
  } catch (errorValue) {
    if (errorValue instanceof IntakeError) return json({ error: errorValue.message, code: errorValue.code }, errorValue.status)
    return json({ error: 'The proposal could not be saved. Use the email fallback and try again later.', code: 'save-failed' }, 503)
  }
}
