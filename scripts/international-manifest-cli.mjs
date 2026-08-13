import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { parseInternationalManifest } from '../shared/international-outpost-manifest.ts'

const root = resolve(import.meta.dirname, '..')
const [command, ...inputs] = process.argv.slice(2)
if (!['build', 'validate', 'report'].includes(command)) throw new Error('Usage: international-manifest-cli.mjs <build|validate|report> [path ...]')

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
  const by = (values) => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]))
  console.log(JSON.stringify({
    manifests: manifests.length,
    candidates: candidates.length,
    countries: [...new Set(candidates.map((candidate) => candidate.countryCode))].length,
    nationalPrograms: [...new Set(candidates.map((candidate) => candidate.nationalProgramId))].length,
    byCountry: by(candidates.map((candidate) => candidate.countryCode)),
    byRriGrouping: by(candidates.map((candidate) => candidate.rriGrouping ?? 'Not Verified')),
    coverage: by(manifests.map(({ manifest }) => manifest.coverage.state)),
    publishReady: 0,
    draftOnly: candidates.length,
    conflicts: 0,
    coverageGaps: manifests.filter(({ manifest }) => manifest.coverage.state !== 'verified-directory-maintained-by-local-editors').length,
  }, null, 2))
} else {
  console.log(`${command === 'build' ? 'Built' : 'Validated'} ${manifests.length} international manifests with ${keys.length} private candidates. No facts were staged or published.`)
}
