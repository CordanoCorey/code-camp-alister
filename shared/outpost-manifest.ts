import { programGroups } from './domain.ts'
import { fcfActivityStatuses, usJurisdictions, type FcfActivityStatus } from './us-directory.ts'

export type ManifestSource = {
  url: string
  label: string
  checkedAt: string
  factKind: 'direct' | 'derived'
  mappingSourceUrl?: string
}

export type OutpostCandidateFacts = {
  church: string
  city: string
  jurisdiction: string
  outpostNumber: string | null
  campusSuffix: string | null
  streetAddress?: string | null
  postalCode?: string | null
  district: string | null
  region: string | null
  fcfTerritory: string | null
  languageOverlay?: string | null
  programs: string[]
  meeting?: string | null
  contactUrl?: string | null
  fcfActivityStatus: FcfActivityStatus
}

export type OutpostManifestCandidate = {
  candidateKey: string
  operation: 'new-listing' | 'correction'
  targetHubOutpostId: string | null
  publicFacts: OutpostCandidateFacts
  fieldSources: Record<string, ManifestSource[]>
}

export type OutpostManifest = {
  schemaVersion: 1
  batchKey: string
  sourceRegister: string
  sourceVersion: string
  reviewedAt: string
  candidates: OutpostManifestCandidate[]
}

const factFields = [
  'church', 'city', 'jurisdiction', 'outpostNumber', 'campusSuffix', 'streetAddress', 'postalCode',
  'district', 'region', 'fcfTerritory', 'languageOverlay', 'programs', 'meeting', 'contactUrl',
  'fcfActivityStatus',
] as const
const prohibitedFields = new Set([
  'leader', 'leaderName', 'personalName', 'email', 'replyEmail', 'phone', 'fax', 'coordinates',
  'latitude', 'longitude', 'roster', 'members', 'memberCount', 'attendance', 'churchAccountNumber',
  'payment', 'charterPayment', 'submitter', 'turnstileToken', 'challengeToken', 'ip', 'ipAddress', 'userAgent',
])

function object(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message)
  return value as Record<string, unknown>
}

function nonempty(value: unknown, maximum: number, label: string) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) {
    throw new Error(`${label} is required and must be ${maximum} characters or fewer.`)
  }
  return value.trim()
}

function nullable(value: unknown, maximum: number, label: string) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || value.trim().length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`)
  return value.trim()
}

function https(value: unknown, label: string) {
  const text = nonempty(value, 500, label)
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' || !url.hostname) throw new Error()
    return text
  } catch {
    throw new Error(`${label} must be a complete HTTPS URL.`)
  }
}

function date(value: unknown, label: string) {
  const text = nonempty(value, 30, label)
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(text) || Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO date.`)
  return text
}

function findProhibited(value: unknown, path = 'manifest'): string | null {
  if (!value || typeof value !== 'object') return null
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (prohibitedFields.has(key)) return `${path}.${key}`
    const nested = findProhibited(child, `${path}.${key}`)
    if (nested) return nested
  }
  return null
}

function parseSource(value: unknown, reviewedAt: string, field: string): ManifestSource {
  const source = object(value, `Source evidence for ${field} must be an object.`)
  const factKind = source.factKind
  if (factKind !== 'direct' && factKind !== 'derived') throw new Error(`Source evidence for ${field} needs direct or derived factKind.`)
  const checkedAt = date(source.checkedAt, `${field} checkedAt`)
  if (Date.parse(checkedAt) > Date.parse(reviewedAt)) throw new Error(`${field} source check cannot be after batch review.`)
  const parsed: ManifestSource = {
    url: https(source.url, `${field} source URL`),
    label: nonempty(source.label, 200, `${field} source label`),
    checkedAt,
    factKind,
  }
  if (factKind === 'derived') parsed.mappingSourceUrl = https(source.mappingSourceUrl, `${field} mapping source URL`)
  else if (source.mappingSourceUrl !== undefined) throw new Error(`Direct ${field} evidence cannot carry a mapping source.`)
  return parsed
}

function parseCandidate(value: unknown, reviewedAt: string): OutpostManifestCandidate {
  const candidate = object(value, 'Each candidate must be an object.')
  const candidateKey = nonempty(candidate.candidateKey, 160, 'Candidate key')
  if (!/^us-[a-z0-9-]+$/.test(candidateKey)) throw new Error(`Candidate key ${candidateKey} must be stable and unrelated to a bare number.`)
  const operation = candidate.operation
  if (operation !== 'new-listing' && operation !== 'correction') throw new Error(`${candidateKey} needs a valid operation.`)
  const targetHubOutpostId = nullable(candidate.targetHubOutpostId, 100, 'Target Hub Outpost ID')
  if ((operation === 'correction') !== Boolean(targetHubOutpostId)) throw new Error(`${candidateKey} correction target must use a Hub Outpost ID.`)
  const rawFacts = object(candidate.publicFacts, `${candidateKey} publicFacts must be an object.`)
  const jurisdiction = nonempty(rawFacts.jurisdiction, 100, `${candidateKey} jurisdiction`)
  if (!usJurisdictions.some((place) => place.name === jurisdiction)) throw new Error(`${candidateKey} jurisdiction is unsupported.`)
  const programs = rawFacts.programs
  if (!Array.isArray(programs) || programs.some((program) => typeof program !== 'string' || !programGroups.includes(program as never))) {
    throw new Error(`${candidateKey} has an unsupported Program Group.`)
  }
  const fcfActivityStatus = rawFacts.fcfActivityStatus
  if (!fcfActivityStatuses.includes(fcfActivityStatus as never)) throw new Error(`${candidateKey} has an invalid FCF Activity Status.`)
  const publicFacts: OutpostCandidateFacts = {
    church: nonempty(rawFacts.church, 160, `${candidateKey} church`),
    city: nonempty(rawFacts.city, 100, `${candidateKey} city`),
    jurisdiction,
    outpostNumber: nullable(rawFacts.outpostNumber, 40, `${candidateKey} number`),
    campusSuffix: nullable(rawFacts.campusSuffix, 80, `${candidateKey} campus`),
    streetAddress: nullable(rawFacts.streetAddress, 200, `${candidateKey} street address`),
    postalCode: nullable(rawFacts.postalCode, 20, `${candidateKey} postal code`),
    district: nullable(rawFacts.district, 160, `${candidateKey} district`),
    region: nullable(rawFacts.region, 160, `${candidateKey} region`),
    fcfTerritory: nullable(rawFacts.fcfTerritory, 160, `${candidateKey} FCF Territory`),
    languageOverlay: nullable(rawFacts.languageOverlay, 160, `${candidateKey} language overlay`),
    programs: programs as string[],
    meeting: nullable(rawFacts.meeting, 500, `${candidateKey} meeting`),
    contactUrl: rawFacts.contactUrl ? https(rawFacts.contactUrl, `${candidateKey} contact URL`) : null,
    fcfActivityStatus: fcfActivityStatus as FcfActivityStatus,
  }
  for (const key of Object.keys(rawFacts)) if (!factFields.includes(key as never)) throw new Error(`${candidateKey} contains unsupported public fact ${key}.`)
  const rawSources = object(candidate.fieldSources, `${candidateKey} fieldSources must be an object.`)
  const fieldSources: Record<string, ManifestSource[]> = {}
  for (const [field, entries] of Object.entries(rawSources)) {
    if (!factFields.includes(field as never) || !Array.isArray(entries) || entries.length === 0 || entries.length > 5) {
      throw new Error(`${candidateKey} has invalid source evidence for ${field}.`)
    }
    fieldSources[field] = entries.map((entry) => parseSource(entry, reviewedAt, field))
  }
  for (const field of factFields) {
    const valueForField = publicFacts[field]
    const populated = Array.isArray(valueForField) ? valueForField.length > 0
      : field === 'fcfActivityStatus' ? valueForField !== 'not-verified'
        : valueForField !== null && valueForField !== ''
    if (populated && !fieldSources[field]) throw new Error(`${candidateKey} needs source evidence for populated ${field}.`)
  }
  return { candidateKey, operation, targetHubOutpostId, publicFacts, fieldSources }
}

export function parseOutpostManifest(value: unknown): OutpostManifest {
  const prohibited = findProhibited(value)
  if (prohibited) throw new Error(`Manifest contains prohibited field ${prohibited}.`)
  const manifest = object(value, 'Manifest must be an object.')
  if (manifest.schemaVersion !== 1) throw new Error('Manifest schemaVersion must be 1.')
  const reviewedAt = date(manifest.reviewedAt, 'Batch reviewedAt')
  if (!Array.isArray(manifest.candidates) || manifest.candidates.length < 1 || manifest.candidates.length > 4) {
    throw new Error('Each manifest batch must contain between one and four candidates.')
  }
  const candidates = manifest.candidates.map((candidate) => parseCandidate(candidate, reviewedAt))
  const evidenceCount = candidates.reduce((count, candidate) => count
    + Object.values(candidate.fieldSources).reduce((fieldCount, sources) => fieldCount + sources.length, 0), 0)
  if (evidenceCount > 24) throw new Error('Each manifest batch may contain at most 24 source evidence rows.')
  if (new Set(candidates.map((candidate) => candidate.candidateKey)).size !== candidates.length) throw new Error('Candidate keys must be unique in a batch.')
  const scoped = new Set<string>()
  for (const candidate of candidates) {
    const facts = candidate.publicFacts
    if (!facts.outpostNumber) continue
    const key = [facts.jurisdiction, facts.district ?? '', facts.outpostNumber, facts.campusSuffix ?? ''].map((part) => part.toLowerCase()).join('|')
    if (scoped.has(key)) throw new Error(`Candidate ${candidate.candidateKey} repeats a scoped number without a distinct district or campus.`)
    scoped.add(key)
  }
  return {
    schemaVersion: 1,
    batchKey: nonempty(manifest.batchKey, 160, 'Batch key'),
    sourceRegister: nonempty(manifest.sourceRegister, 200, 'Source register'),
    sourceVersion: nonempty(manifest.sourceVersion, 100, 'Source version'),
    reviewedAt,
    candidates,
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`
  return JSON.stringify(value)
}

export async function manifestChecksum(value: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
