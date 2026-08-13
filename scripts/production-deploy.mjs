import { spawnSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readWranglerConfig, validateProductionConfig } from './production-config.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed.\n${result.stdout ?? ''}\n${result.stderr ?? ''}`)
  }
  return (result.stdout ?? '').trim()
}

async function findBuiltConfig(directory, workerName) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = await findBuiltConfig(path, workerName)
      if (nested) return nested
    } else if (entry.name === 'wrangler.json') {
      const config = JSON.parse(await readFile(path, 'utf8'))
      if (config.name === workerName) return { path, config }
    }
  }
  return null
}

function assertTraceableRelease() {
  const status = run('git', ['status', '--porcelain', '--untracked-files=all'])
  if (status) throw new Error('Production deployment requires a clean, reviewed release commit.')
  return run('git', ['rev-parse', 'HEAD'])
}

async function main() {
  const sourceConfig = await readWranglerConfig()
  const production = validateProductionConfig(sourceConfig)
  const releaseSha = assertTraceableRelease()
  const environment = { ...process.env, CLOUDFLARE_ENV: 'production', NO_COLOR: '1' }

  run(npm, ['run', 'build'], { env: environment, stdio: 'inherit' })
  const built = await findBuiltConfig(join(root, 'dist'), production.workerName)
  if (!built) throw new Error('The Vite build did not produce the production Worker configuration.')
  if (built.config.targetEnvironment !== 'production') {
    throw new Error('The Vite build did not select the Wrangler production environment.')
  }
  if (Object.hasOwn(built.config.vars ?? {}, 'LOCAL_OPERATOR_PREVIEW')) {
    throw new Error('The production build contains the local Operator preview variable.')
  }
  const builtDatabases = built.config.d1_databases ?? []
  const sourceDatabase = sourceConfig.env.production.d1_databases[0]
  if (
    builtDatabases.length !== 1 ||
    builtDatabases[0].database_name !== production.databaseName ||
    builtDatabases[0].database_id !== sourceDatabase.database_id
  ) {
    throw new Error('The production build does not contain the reviewed D1 binding.')
  }
  if (built.config.observability?.logs?.head_sampling_rate !== 0.1) {
    throw new Error('The production build does not contain the reviewed log sampling configuration.')
  }
  const builtCrons = built.config.triggers?.crons ?? []
  if (builtCrons.length !== 1 || builtCrons[0] !== production.maintenanceCron) {
    throw new Error('The production build does not contain the reviewed maintenance dispatcher Cron.')
  }

  run(npx, [
    'wrangler',
    'deploy',
    '--config',
    built.path,
    '--message',
    `Ranger Outpost Hub release ${releaseSha}`,
  ], { env: environment, stdio: 'inherit' })
}

main().catch((error) => {
  console.error(`Production deployment stopped: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
