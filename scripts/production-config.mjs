import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ZERO_UUID = '00000000-0000-0000-0000-000000000000'
const SERVER_ONLY_KEYS = ['ACCESS_TEAM_DOMAIN', 'ACCESS_POLICY_AUD', 'TURNSTILE_SECRET_KEY', 'INTAKE_SIGNING_SECRET']
const LOCAL_BYPASSES = ['LOCAL_OPERATOR_PREVIEW', 'LOCAL_PUBLIC_INTAKE_BYPASS']

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export async function readWranglerConfig(path = new URL('../wrangler.jsonc', import.meta.url)) {
  return JSON.parse(await readFile(path, 'utf8'))
}

export function validateProductionConfig(config) {
  assert(config && typeof config === 'object', 'Wrangler configuration is missing.')
  for (const key of LOCAL_BYPASSES) assert(!Object.hasOwn(config.vars ?? {}, key), `${key} must live only in ignored local development variables.`)
  const production = config.env?.production
  assert(production && typeof production === 'object', 'The Wrangler production environment is missing.')
  assert(production.name === 'ranger-outpost-hub-production', 'The production Worker name is unexpected.')
  assert(production.workers_dev === true, 'The production Worker must explicitly enable its workers.dev hostname.')
  for (const key of LOCAL_BYPASSES) assert(!Object.hasOwn(production.vars ?? {}, key), `Production must not define ${key}.`)
  for (const key of SERVER_ONLY_KEYS) {
    assert(!Object.hasOwn(config.vars ?? {}, key), `${key} must be stored as a production Worker secret.`)
    assert(!Object.hasOwn(production.vars ?? {}, key), `${key} must be stored as a production Worker secret.`)
  }

  assert(Array.isArray(production.d1_databases) && production.d1_databases.length === 1, 'Production must have exactly one D1 binding.')
  const database = production.d1_databases[0]
  assert(database.binding === 'DB', 'The production D1 binding must be named DB.')
  assert(database.database_name === 'ranger-outpost-hub-production', 'The production D1 database name is unexpected.')
  assert(UUID.test(database.database_id) && database.database_id !== ZERO_UUID, 'Production requires a real nonzero D1 database UUID.')
  assert(database.migrations_dir === 'migrations', 'The production D1 binding must use the reviewed migrations directory.')

  const observability = production.observability
  assert(observability?.enabled === true, 'Production Workers observability must be enabled.')
  assert(observability.logs?.enabled === true, 'Production Workers Logs must be enabled.')
  assert(observability.logs.invocation_logs === false, 'Production invocation logs must be disabled so request URLs are not retained.')
  assert(observability.logs.persist === true, 'Production logs must be persisted for the configured retention period.')
  assert(
    typeof observability.logs.head_sampling_rate === 'number' &&
      observability.logs.head_sampling_rate > 0 &&
      observability.logs.head_sampling_rate <= 1,
    'Production log sampling must be greater than zero and at most one.',
  )

  return {
    databaseName: database.database_name,
    workerName: production.name,
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  readWranglerConfig()
    .then(validateProductionConfig)
    .then((result) => console.log(JSON.stringify({ ok: true, ...result }, null, 2)))
    .catch((error) => {
      console.error(`Production configuration is not ready: ${error instanceof Error ? error.message : String(error)}`)
      process.exitCode = 1
    })
}
