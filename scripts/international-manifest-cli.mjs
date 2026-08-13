import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { parseInternationalManifest } from '../shared/international-outpost-manifest.ts'

const root = resolve(import.meta.dirname, '..')
const [command, ...arguments_] = process.argv.slice(2)
const originIndex = arguments_.indexOf('--origin')
const suppliedOrigin = originIndex >= 0 ? arguments_[originIndex + 1] : undefined
const inputs = arguments_.filter((argument, index) => argument !== '--origin' && (originIndex < 0 || index !== originIndex + 1))
if (!['build', 'validate', 'stage', 'report'].includes(command)) throw new Error('Usage: international-manifest-cli.mjs <build|validate|stage|report> [path ...] [--origin URL]')

async function jsonFiles(path) {
  const absolute = resolve(root, path)
  const metadata = await stat(absolute)
  if (metadata.isFile()) return extname(absolute) === '.json' && basename(absolute) !== 'schema.json' ? [absolute] : []
  return (await Promise.all((await readdir(absolute, { withFileTypes: true })).map((entry) => jsonFiles(resolve(absolute, entry.name))))).flat().sort()
}

const files = (await Promise.all((inputs.length ? inputs : ['data/international-outposts']).map(jsonFiles))).flat()
if (!files.length) throw new Error('No international manifest files were found.')
const manifests = []
for (const file of files) manifests.push({ file, manifest: parseInternationalManifest(JSON.parse(await readFile(file, 'utf8'))) })
const keys = manifests.flatMap(({ manifest }) => manifest.candidates.map((candidate) => candidate.candidateKey))
if (new Set(keys).size !== keys.length) throw new Error('Candidate keys must be unique across all manifests.')

if (command === 'report') {
  const candidates = manifests.flatMap(({ manifest }) => manifest.candidates)
  const evidenceUrls = manifests.flatMap(({ manifest }) => [
    ...manifest.coverage.sources.map((source) => source.url),
    ...(manifest.conflicts ?? []).flatMap((conflict) => conflict.sources.map((source) => source.url)),
    ...manifest.candidates.flatMap((candidate) => Object.values(candidate.fieldSources).flat().map((source) => source.url)),
  ])
  const sourceType = (value) => {
    const hostname = new URL(value).hostname
    if (hostname === 'rri.world') return 'rri'
    if (hostname === 'open.dosm.gov.my') return 'civil-authority'
    if (['calvary.my', 'www.calvary.my', 'www.graceklang.com', 'www.lakesidechurch.uk'].includes(hostname)) return 'local-church'
    return 'national-program'
  }
  const by = (values) => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]))
  console.log(JSON.stringify({
    manifests: manifests.length,
    candidates: candidates.length,
    countries: [...new Set(candidates.map((candidate) => candidate.countryCode))].length,
    nationalPrograms: [...new Set(candidates.map((candidate) => candidate.nationalProgramId))].length,
    byCountry: by(candidates.map((candidate) => candidate.countryCode)),
    byRriGrouping: by(candidates.map((candidate) => candidate.rriGrouping ?? 'Not Verified')),
    sourceEvidenceRowsByType: by(evidenceUrls.map(sourceType)),
    coverage: by(manifests.map(({ manifest }) => manifest.coverage.state)),
    publishReady: 0,
    draftOnly: candidates.length,
    conflicts: manifests.reduce((count, { manifest }) => count + (manifest.conflicts?.length ?? 0), 0),
    coverageGaps: manifests.filter(({ manifest }) => manifest.coverage.state !== 'verified-directory-maintained-by-local-editors').length,
  }, null, 2))
} else if (command === 'stage') {
  const origin = new URL(suppliedOrigin ?? process.env.OUTPOSTS_ORIGIN ?? 'http://127.0.0.1:5173').origin
  const headers = { 'content-type': 'application/json', ...(process.env.CF_ACCESS_SESSION_TOKEN ? { cookie: `CF_Authorization=${process.env.CF_ACCESS_SESSION_TOKEN}` } : {}) }
  for (const { manifest } of manifests) {
    const response = await fetch(`${origin}/api/operator/international-population/stage`, { method: 'POST', headers, body: JSON.stringify({ manifest }) })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error ?? `Staging failed with HTTP ${response.status}.`)
    console.log(`${manifest.batchKey}: ${body.idempotent ? 'already staged' : `staged ${body.candidateCount} private candidates`}`)
  }
} else {
  console.log(`${command === 'build' ? 'Built' : 'Validated'} ${manifests.length} international manifests with ${keys.length} private candidates. No facts were staged or published.`)
}
