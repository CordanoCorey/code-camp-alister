import { isIsoCountryCode } from './countries.ts'

export const internationalCoverageStates = [
  'program-not-verified',
  'country-information-directory-incomplete',
  'accepting-verified-submissions',
  'verified-directory-maintained-by-local-editors',
] as const

type CoverageState = typeof internationalCoverageStates[number]
type Source = { url: string; label: string; checkedAt: string }

export type InternationalCandidate = {
  candidateKey: string
  countryCode: string
  countryName: string
  nationalProgramId: string
  nationalProgramName: string
  rriGrouping: string | null
  localUnitLabel: string
  identifierRaw: string | null
  displayNameRaw: string | null
  church: string | null
  civilSubdivision: { label: string; name: string } | null
  city: string | null
  streetAddress: string | null
  contactUrl: string | null
  affiliations: { label: string; name: string; scope: string }[]
  fcfAvailability: 'available' | 'not-offered' | 'not-verified'
  activeFcf: boolean | null
  fieldSources: Record<string, Source[]>
}

export type InternationalManifest = {
  schemaVersion: 1
  batchKey: string
  sourceRegister: string
  reviewedAt: string
  coverage: { countryCode: string; state: CoverageState; namedLocalEditors: string | null; sources: Source[] }
  conflicts?: Array<{ conflictKey: string; identifierRaw: string; description: string; sources: Source[] }>
  candidates: InternationalCandidate[]
}

const prohibited = new Set(['email', 'phone', 'leader', 'leaderName', 'roster', 'members', 'attendance', 'coordinates', 'latitude', 'longitude', 'ip', 'ipAddress', 'userAgent', 'notes'])
const sourcedFields = ['countryName', 'nationalProgramName', 'rriGrouping', 'localUnitLabel', 'identifierRaw', 'displayNameRaw', 'church', 'civilSubdivision', 'city', 'streetAddress', 'contactUrl', 'affiliations', 'fcfAvailability', 'activeFcf']

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`)
  return value as Record<string, unknown>
}
function onlyKeys(value: Record<string, unknown>, allowed: string[], label: string) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key))
  if (unknown) throw new Error(`${label} contains unsupported field ${unknown}.`)
}
function text(value: unknown, maximum: number, label: string, optional = false): string | null {
  if (optional && (value === null || value === undefined || value === '')) return null
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer${optional ? '' : ' and is required'}.`)
  return value.trim()
}
function isoDate(value: unknown, label: string): string {
  const result = text(value, 10, label) as string
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(result)
  const parsed = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null
  if (!parsed || parsed.toISOString().slice(0, 10) !== result) throw new Error(`${label} must be a valid ISO date.`)
  return result
}
function url(value: unknown, label: string): string {
  const result = text(value, 500, label) as string
  try { const parsed = new URL(result); if (parsed.protocol !== 'https:' || !parsed.hostname) throw new Error() } catch { throw new Error(`${label} must be a complete HTTPS URL.`) }
  return result
}
function source(value: unknown, reviewedAt: string, label: string): Source {
  const raw = record(value, label)
  onlyKeys(raw, ['url', 'label', 'checkedAt'], label)
  const checkedAt = isoDate(raw.checkedAt, `${label} checkedAt`)
  if (checkedAt > reviewedAt) throw new Error(`${label} cannot be checked after batch review.`)
  return { url: url(raw.url, `${label} URL`), label: text(raw.label, 200, `${label} label`) as string, checkedAt }
}
function findProhibited(value: unknown, path = 'manifest'): string | null {
  if (!value || typeof value !== 'object') return null
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (prohibited.has(key)) return `${path}.${key}`
    const nested = findProhibited(child, `${path}.${key}`); if (nested) return nested
  }
  return null
}

export function parseInternationalManifest(value: unknown): InternationalManifest {
  const forbidden = findProhibited(value); if (forbidden) throw new Error(`Manifest contains prohibited field ${forbidden}.`)
  const raw = record(value, 'Manifest')
  onlyKeys(raw, ['schemaVersion', 'batchKey', 'sourceRegister', 'reviewedAt', 'coverage', 'conflicts', 'candidates'], 'Manifest')
  if (raw.schemaVersion !== 1) throw new Error('Manifest schemaVersion must be 1.')
  const reviewedAt = isoDate(raw.reviewedAt, 'reviewedAt')
  const coverageRaw = record(raw.coverage, 'coverage')
  onlyKeys(coverageRaw, ['countryCode', 'state', 'namedLocalEditors', 'sources'], 'coverage')
  const coverageCountry = text(coverageRaw.countryCode, 2, 'coverage countryCode') as string
  if (!isIsoCountryCode(coverageCountry)) throw new Error('coverage countryCode is unsupported.')
  if (!internationalCoverageStates.includes(coverageRaw.state as CoverageState)) throw new Error('coverage state is unsupported.')
  const editors = text(coverageRaw.namedLocalEditors, 200, 'named local editors', true)
  if ((coverageRaw.state === 'verified-directory-maintained-by-local-editors') !== Boolean(editors)) throw new Error('Named local editors are required only for a locally maintained verified directory.')
  if (!Array.isArray(coverageRaw.sources) || coverageRaw.sources.length < 1 || coverageRaw.sources.length > 5) throw new Error('Coverage needs one to five sources.')
  if (!Array.isArray(raw.candidates) || raw.candidates.length < 1 || raw.candidates.length > 4) throw new Error('Each international batch must contain one to four candidates.')
  const conflicts = raw.conflicts === undefined ? [] : raw.conflicts
  if (!Array.isArray(conflicts) || conflicts.length > 8) throw new Error('International conflicts must be a bounded array.')
  const parsedConflicts = conflicts.map((item, index) => {
    const conflict = record(item, `conflict ${index + 1}`)
    onlyKeys(conflict, ['conflictKey', 'identifierRaw', 'description', 'sources'], `conflict ${index + 1}`)
    const conflictKey = text(conflict.conflictKey, 160, 'conflictKey') as string
    if (!/^intl-conflict-[a-z0-9-]+$/.test(conflictKey)) throw new Error(`${conflictKey} is not a stable conflict key.`)
    if (!Array.isArray(conflict.sources) || conflict.sources.length < 1 || conflict.sources.length > 5) throw new Error(`${conflictKey} needs one to five sources.`)
    return { conflictKey, identifierRaw: text(conflict.identifierRaw, 80, `${conflictKey} identifierRaw`) as string, description: text(conflict.description, 500, `${conflictKey} description`) as string, sources: conflict.sources.map((entry, sourceIndex) => source(entry, reviewedAt, `${conflictKey}.sources[${sourceIndex}]`)) }
  })
  const candidates = raw.candidates.map((item, index) => {
    const candidate = record(item, `candidate ${index + 1}`)
    onlyKeys(candidate, ['candidateKey', 'countryCode', 'countryName', 'nationalProgramId', 'nationalProgramName', 'rriGrouping', 'localUnitLabel', 'identifierRaw', 'displayNameRaw', 'church', 'civilSubdivision', 'city', 'streetAddress', 'contactUrl', 'affiliations', 'fcfAvailability', 'activeFcf', 'fieldSources'], `candidate ${index + 1}`)
    const key = text(candidate.candidateKey, 160, 'candidateKey') as string
    if (!/^intl-[a-z0-9-]+$/.test(key)) throw new Error(`${key} is not a stable international candidate key.`)
    const countryCode = text(candidate.countryCode, 2, `${key} countryCode`) as string
    if (!isIsoCountryCode(countryCode) || countryCode === 'US' || countryCode !== coverageCountry) throw new Error(`${key} has unsupported or inconsistent country scope.`)
    const programId = text(candidate.nationalProgramId, 100, `${key} nationalProgramId`) as string
    const subdivisionRaw = candidate.civilSubdivision === null ? null : record(candidate.civilSubdivision, `${key} civilSubdivision`)
    if (subdivisionRaw) onlyKeys(subdivisionRaw, ['label', 'name'], `${key} civilSubdivision`)
    const affiliationsRaw = candidate.affiliations
    if (!Array.isArray(affiliationsRaw) || affiliationsRaw.length > 8) throw new Error(`${key} affiliations must be a bounded array.`)
    const fcfAvailability = candidate.fcfAvailability
    if (!['available', 'not-offered', 'not-verified'].includes(String(fcfAvailability))) throw new Error(`${key} has invalid FCF availability.`)
    const activeFcf = candidate.activeFcf
    if (activeFcf !== null && typeof activeFcf !== 'boolean') throw new Error(`${key} activeFcf must be true, false, or null.`)
    if (activeFcf === true && fcfAvailability !== 'available') throw new Error(`${key} cannot have active FCF without verified availability.`)
    const fieldsRaw = record(candidate.fieldSources, `${key} fieldSources`)
    const fieldSources: Record<string, Source[]> = {}
    for (const [field, entries] of Object.entries(fieldsRaw)) {
      if (!sourcedFields.includes(field) || !Array.isArray(entries) || entries.length < 1 || entries.length > 5) throw new Error(`${key} has invalid provenance for ${field}.`)
      fieldSources[field] = entries.map((entry, sourceIndex) => source(entry, reviewedAt, `${key}.${field}[${sourceIndex}]`))
    }
    const result: InternationalCandidate = {
      candidateKey: key, countryCode, countryName: text(candidate.countryName, 100, `${key} countryName`) as string,
      nationalProgramId: programId, nationalProgramName: text(candidate.nationalProgramName, 160, `${key} nationalProgramName`) as string,
      rriGrouping: text(candidate.rriGrouping, 100, `${key} rriGrouping`, true), localUnitLabel: text(candidate.localUnitLabel, 80, `${key} localUnitLabel`) as string,
      identifierRaw: text(candidate.identifierRaw, 80, `${key} identifierRaw`, true), displayNameRaw: text(candidate.displayNameRaw, 160, `${key} displayNameRaw`, true), church: text(candidate.church, 160, `${key} church`, true),
      civilSubdivision: subdivisionRaw ? { label: text(subdivisionRaw.label, 80, `${key} subdivision label`) as string, name: text(subdivisionRaw.name, 100, `${key} subdivision name`) as string } : null,
      city: text(candidate.city, 100, `${key} city`, true), streetAddress: text(candidate.streetAddress, 200, `${key} streetAddress`, true),
      contactUrl: candidate.contactUrl ? url(candidate.contactUrl, `${key} contactUrl`) : null,
      affiliations: affiliationsRaw.map((entry, affiliationIndex) => { const affiliation = record(entry, `${key} affiliation ${affiliationIndex + 1}`); onlyKeys(affiliation, ['label', 'name', 'scope'], `${key} affiliation ${affiliationIndex + 1}`); const scope = text(affiliation.scope, 80, 'affiliation scope') as string; if (!['ministry', 'language', 'fcf'].includes(scope)) throw new Error(`${key} affiliation scope is unsupported.`); return { label: text(affiliation.label, 80, 'affiliation label') as string, name: text(affiliation.name, 160, 'affiliation name') as string, scope } }),
      fcfAvailability: fcfAvailability as InternationalCandidate['fcfAvailability'], activeFcf: activeFcf as boolean | null, fieldSources,
    }
    for (const field of sourcedFields) {
      const fieldValue = result[field as keyof InternationalCandidate]
      const populated = Array.isArray(fieldValue) ? fieldValue.length > 0 : fieldValue !== null && fieldValue !== 'not-verified'
      if (populated && !fieldSources[field]) throw new Error(`${key} needs field-level provenance for ${field}.`)
    }
    return result
  })
  if (new Set(candidates.map((candidate) => candidate.candidateKey)).size !== candidates.length) throw new Error('Candidate keys must be unique in a batch.')
  const identities = new Set<string>()
  for (const candidate of candidates) { if (!candidate.identifierRaw) continue; const identity = `${candidate.countryCode}|${candidate.nationalProgramId}|${candidate.identifierRaw}`.toLocaleLowerCase(); if (identities.has(identity)) throw new Error('Source-native identifiers must be unique within country and National Program scope.'); identities.add(identity) }
  return { schemaVersion: 1, batchKey: text(raw.batchKey, 160, 'batchKey') as string, sourceRegister: text(raw.sourceRegister, 200, 'sourceRegister') as string, reviewedAt, coverage: { countryCode: coverageCountry, state: coverageRaw.state as CoverageState, namedLocalEditors: editors, sources: (coverageRaw.sources as unknown[]).map((entry, index) => source(entry, reviewedAt, `coverage source ${index + 1}`)) }, conflicts: parsedConflicts, candidates }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`
  return JSON.stringify(value)
}

export async function internationalManifestChecksum(value: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
