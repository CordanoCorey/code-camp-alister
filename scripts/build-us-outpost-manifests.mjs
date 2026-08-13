import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { parseOutpostManifest } from '../shared/outpost-manifest.ts'

const projectRoot = resolve(import.meta.dirname, '..')
const outputDirectory = join(projectRoot, 'data', 'us-outposts')
const checkedAt = '2026-08-13'
const notes = [
  ['north', 'docs/research/us-outpost-cohort-north.md'],
  ['south', 'docs/research/us-outpost-cohort-south.md'],
]

const jurisdictions = {
  AL: 'Alabama', AR: 'Arkansas', AZ: 'Arizona', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DC: 'District of Columbia', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', IA: 'Iowa',
  ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  MA: 'Massachusetts', MD: 'Maryland', ME: 'Maine', MI: 'Michigan', MN: 'Minnesota', MO: 'Missouri',
  MS: 'Mississippi', MT: 'Montana', NC: 'North Carolina', ND: 'North Dakota', NE: 'Nebraska',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NV: 'Nevada', NY: 'New York',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VA: 'Virginia',
  VT: 'Vermont', WA: 'Washington', WI: 'Wisconsin', WV: 'West Virginia', WY: 'Wyoming',
}
const correctionTargets = {
  'us-sc-tx-first-assembly-angleton': 'outpost-stx-70',
  'us-sc-tx-friendship-church-richmond': 'outpost-stx-132',
  'us-sc-tx-light-christian-center-alvin': 'outpost-stx-355',
  'us-sc-tx-victory-assembly-universal-city': 'outpost-stx-173',
}

function references(value) {
  return [...value.matchAll(/\[((?:[A-Z]\d+[a-z]?)(?:,\s*[A-Z]\d+[a-z]?)*?)\]/g)]
    .flatMap((match) => match[1].split(',').map((item) => item.trim()))
}

function withoutReferences(value) {
  return value.replace(/\[[A-Z]\d+[a-z]?(?:,\s*[A-Z]\d+[a-z]?)*\]/g, '').replaceAll('`', '').trim()
}

function sourceRegister(markdown) {
  const sources = new Map()
  for (const match of markdown.matchAll(/^- \*\*([A-Z]\d+[a-z]?) — \[([^\]]+)\]\((https:\/\/[^)]+)\)\.\*\*/gm)) {
    sources.set(match[1], { id: match[1], label: match[2], url: match[3] })
  }
  return sources
}

function unique(values) {
  return [...new Set(values)]
}

function evidence(source, factKind = 'direct', mappingSourceUrl) {
  return {
    url: source.url,
    label: source.label,
    checkedAt,
    factKind,
    ...(mappingSourceUrl ? { mappingSourceUrl } : {}),
  }
}

function buildCandidate(cells, sources) {
  const [rawKey, churchCell, cityCell, scopedCell, geographyCell, identityCell] = cells
  const candidateKey = withoutReferences(rawKey)
  const church = withoutReferences(churchCell)
  const cityMatch = withoutReferences(cityCell).match(/^(.*),\s*([A-Z]{2})$/)
  if (!cityMatch || !jurisdictions[cityMatch[2]]) throw new Error(`${candidateKey} has an unsupported city/state cell.`)
  const [rawDistrict, rawRegion] = withoutReferences(geographyCell).split('/').map((value) => value.trim())
  if (!rawRegion) throw new Error(`${candidateKey} is missing a region classification.`)
  const outpostMatch = withoutReferences(scopedCell).match(/^Outpost\s+(.+)$/i)
  const directReferenceIds = unique([
    ...references(churchCell), ...references(identityCell), ...references(scopedCell), ...references(cityCell),
  ].filter((id) => id !== 'M1'))
  if (!directReferenceIds.length) throw new Error(`${candidateKey} has no direct evidence source.`)
  const sourceFor = (id) => {
    const source = sources.get(id)
    if (!source) throw new Error(`${candidateKey} refers to missing source ${id}.`)
    return source
  }
  const churchReferenceIds = unique([...references(churchCell), ...references(identityCell)]).filter((id) => id !== 'M1')
  const locationReferenceId = references(cityCell).find((id) => id !== 'M1') ?? directReferenceIds[0]
  const map = sourceFor('M1')
  const derivationBase = sourceFor(locationReferenceId)
  const district = rawDistrict === '—' || rawDistrict === 'District not resolved' ? null : `${rawDistrict} District`
  const region = `${rawRegion} Region`
  const fieldSources = {
    church: (churchReferenceIds.length ? churchReferenceIds : [directReferenceIds[0]]).map((id) => evidence(sourceFor(id))),
    city: [evidence(derivationBase)],
    jurisdiction: [evidence(derivationBase)],
    region: [evidence(derivationBase, 'derived', map.url)],
  }
  if (district) {
    fieldSources.district = rawDistrict === 'South Texas' && directReferenceIds.includes('D1')
      ? [evidence(sourceFor('D1'))]
      : [evidence(derivationBase, 'derived', map.url)]
  }
  if (outpostMatch) {
    const numberReferenceId = references(scopedCell).find((id) => id !== 'M1') ?? directReferenceIds[0]
    fieldSources.outpostNumber = [evidence(sourceFor(numberReferenceId))]
  }
  const targetHubOutpostId = correctionTargets[candidateKey] ?? null
  return {
    candidateKey,
    operation: targetHubOutpostId ? 'correction' : 'new-listing',
    targetHubOutpostId,
    publicFacts: {
      church,
      city: cityMatch[1],
      jurisdiction: jurisdictions[cityMatch[2]],
      outpostNumber: outpostMatch?.[1] ?? null,
      campusSuffix: null,
      streetAddress: null,
      postalCode: null,
      district,
      region,
      fcfTerritory: null,
      languageOverlay: null,
      programs: [],
      meeting: null,
      contactUrl: null,
      fcfActivityStatus: 'not-verified',
    },
    fieldSources,
  }
}

function sourceEvidenceCount(candidate) {
  return Object.values(candidate.fieldSources).reduce((count, entries) => count + entries.length, 0)
}

function batches(candidates) {
  const result = []
  let current = []
  let evidenceCount = 0
  for (const candidate of candidates) {
    const candidateEvidence = sourceEvidenceCount(candidate)
    if (current.length && (current.length === 4 || evidenceCount + candidateEvidence > 24)) {
      result.push(current)
      current = []
      evidenceCount = 0
    }
    current.push(candidate)
    evidenceCount += candidateEvidence
  }
  if (current.length) result.push(current)
  return result
}

await mkdir(outputDirectory, { recursive: true })
for (const file of await readdir(outputDirectory)) {
  if (/^cohort-(north|south)-\d+\.json$/.test(file)) await unlink(join(outputDirectory, file))
}

let candidateCount = 0
let batchCount = 0
for (const [cohort, notePath] of notes) {
  const markdown = await readFile(join(projectRoot, notePath), 'utf8')
  const sources = sourceRegister(markdown)
  const candidates = markdown.split(/\r?\n/)
    .filter((line) => line.startsWith('| `us-'))
    .map((line) => buildCandidate(line.split('|').slice(1, -1).map((cell) => cell.trim()), sources))
  if (!candidates.length) throw new Error(`${notePath} contains no candidate rows.`)
  candidateCount += candidates.length
  for (const [index, candidateBatch] of batches(candidates).entries()) {
    const number = String(index + 1).padStart(2, '0')
    const manifest = parseOutpostManifest({
      schemaVersion: 1,
      batchKey: `us-2026-08-13-${cohort}-${number}`,
      sourceRegister: notePath,
      sourceVersion: `${basename(notePath, '.md')}-2026-08-13`,
      reviewedAt: checkedAt,
      candidates: candidateBatch,
    })
    await writeFile(join(outputDirectory, `cohort-${cohort}-${number}.json`), `${JSON.stringify(manifest, null, 2)}\n`)
    batchCount += 1
  }
}

console.log(`Generated ${batchCount} validated manifests with ${candidateCount} candidates in data/us-outposts.`)
