import { execFileSync } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { parseOutpostManifest } from '../shared/outpost-manifest.ts'

const projectRoot = resolve(import.meta.dirname, '..')
const [command, ...rawArguments] = process.argv.slice(2)
const production = rawArguments.includes('--production')
const originIndex = rawArguments.indexOf('--origin')
const suppliedOrigin = originIndex >= 0 ? rawArguments[originIndex + 1] : undefined
const paths = rawArguments.filter((argument, index) => argument !== '--production'
  && argument !== '--origin' && index !== originIndex + 1)

async function jsonFiles(inputPath) {
  const absolutePath = resolve(projectRoot, inputPath)
  const metadata = await stat(absolutePath)
  if (metadata.isFile()) return extname(absolutePath) === '.json' && basename(absolutePath) !== 'schema.json' ? [absolutePath] : []
  const entries = await readdir(absolutePath, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => jsonFiles(resolve(absolutePath, entry.name))))
  return nested.flat().sort()
}

async function loadManifests() {
  const inputs = paths.length ? paths : ['data/us-outposts']
  const files = (await Promise.all(inputs.map(jsonFiles))).flat()
  if (!files.length) throw new Error('No JSON manifest files were found.')
  const manifests = []
  for (const file of files) {
    let value
    try {
      value = JSON.parse(await readFile(file, 'utf8'))
    } catch (error) {
      throw new Error(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
    manifests.push({ file, manifest: parseOutpostManifest(value) })
  }
  return manifests
}

function accessHeaders() {
  const sessionToken = process.env.CF_ACCESS_SESSION_TOKEN
  if (production && !sessionToken) {
    throw new Error('Production staging requires a short-lived CF_ACCESS_SESSION_TOKEN for the sole Operator identity.')
  }
  return sessionToken ? { cookie: `CF_Authorization=${sessionToken}` } : {}
}

function apiOrigin() {
  const value = production ? process.env.OUTPOSTS_PRODUCTION_ORIGIN : suppliedOrigin ?? process.env.OUTPOSTS_ORIGIN ?? 'http://127.0.0.1:5173'
  if (!value) throw new Error('Set OUTPOSTS_PRODUCTION_ORIGIN to the deployed HTTPS origin.')
  const url = new URL(value)
  if (production && (url.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Production staging requires an explicit non-loopback HTTPS OUTPOSTS_PRODUCTION_ORIGIN.')
  }
  return url.origin
}

function assertCleanProductionWorktree() {
  if (!production) return
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim()
  if (dirty) throw new Error('Production staging requires a clean worktree.')
}

async function readResponse(response) {
  const text = await response.text()
  let body
  try { body = text ? JSON.parse(text) : {} } catch { body = { error: text } }
  if (!response.ok) throw new Error(body.error || `Request failed with HTTP ${response.status}.`)
  return body
}

if (!['validate', 'stage', 'report'].includes(command)) {
  throw new Error('Usage: outpost-manifest-cli.mjs <validate|stage|report> [path ...] [--origin URL] [--production]')
}

if (command === 'report') {
  const response = await fetch(`${apiOrigin()}/api/operator/population/report`, { headers: accessHeaders() })
  console.log(JSON.stringify(await readResponse(response), null, 2))
} else {
  const manifests = await loadManifests()
  const candidateCount = manifests.reduce((count, item) => count + item.manifest.candidates.length, 0)
  console.log(`Validated ${manifests.length} manifests with ${candidateCount} candidates before any write.`)
  if (command === 'stage') {
    assertCleanProductionWorktree()
    const origin = apiOrigin()
    const headers = { ...accessHeaders(), 'content-type': 'application/json' }
    for (const item of manifests) {
      const response = await fetch(`${origin}/api/operator/population/stage`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ manifest: item.manifest }),
      })
      const result = await readResponse(response)
      console.log(`${item.manifest.batchKey}: ${result.idempotent ? 'already staged' : `staged ${result.candidateCount} candidates`}`)
    }
  }
}
