import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { candidateDraft, parseEventCandidateManifest } from '../shared/event-candidate-manifest.ts'

const projectRoot = resolve(import.meta.dirname, '..')
const [command, input = 'data/events/reference-calendar-2026.json', ...arguments_] = process.argv.slice(2)
const originIndex = arguments_.indexOf('--origin')
const origin = new URL(originIndex >= 0 ? arguments_[originIndex + 1] : process.env.EVENTS_ORIGIN ?? 'http://127.0.0.1:5173').origin

if (!['validate', 'stage'].includes(command)) {
  throw new Error('Usage: event-candidate-cli.mjs <validate|stage> [manifest] [--origin URL]')
}

const manifest = parseEventCandidateManifest(JSON.parse(await readFile(resolve(projectRoot, input), 'utf8')))
console.log(`Validated ${manifest.candidates.length} review candidates from ${manifest.batchKey}; no content was published.`)

async function responseJson(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Request failed with HTTP ${response.status}.`)
  return body
}

if (command === 'stage') {
  for (const candidate of manifest.candidates) {
    const created = await responseJson(await fetch(`${origin}/api/operator/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ record: candidateDraft(candidate), reason: `Staged for Operator review from ${manifest.batchKey}:${candidate.candidateId}` }),
    }))
    for (const conflict of candidate.conflicts) {
      await responseJson(await fetch(`${origin}/api/operator/conflicts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventId: created.id, ...conflict }),
      }))
    }
    console.log(`${candidate.candidateId}: staged draft${candidate.conflicts.length ? ` with ${candidate.conflicts.length} open conflict(s)` : ''}`)
  }
  console.log('Operator review is required for every draft; this command has no publication operation.')
}
