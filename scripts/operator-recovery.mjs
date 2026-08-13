import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

const projectRoot = new URL('../', import.meta.url)
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

export function validateRecoveryInput({ productionOrigin, displayName, successorEmail }) {
  const origin = new URL(productionOrigin)
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Production origin must be one HTTPS origin without a path, query, or fragment.')
  }
  const normalizedEmail = successorEmail.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
    throw new Error('Enter a valid successor email.')
  }
  const normalizedName = displayName.trim()
  if (!normalizedName || normalizedName.length > 80) throw new Error('Display Name must be 1–80 characters.')
  return { productionOrigin: origin.origin, displayName: normalizedName, successorEmail: normalizedEmail }
}

export function recoverySql(input) {
  return `UPDATE operator_transfers SET state = 'expired', successor_display_name = NULL,
  successor_email = NULL, successor_current_outpost_id = NULL, acceptance_token_hash = NULL,
  expired_at = ${sql(input.createdAt)}
WHERE state = 'pending' AND expires_at <= ${sql(input.createdAt)};
INSERT INTO privileged_access_events
  (action, actor_tenure_number, transfer_id, request_id, created_at)
SELECT 'transfer-expired', predecessor_tenure_number, id, ${sql(input.expiredRequestId)}, ${sql(input.createdAt)}
FROM operator_transfers transfer
WHERE state = 'expired' AND expired_at = ${sql(input.createdAt)}
  AND NOT EXISTS (
    SELECT 1 FROM privileged_access_events event
    WHERE event.transfer_id = transfer.id AND event.action = 'transfer-expired'
  );
INSERT INTO operator_transition_checks
  (transition_kind, request_id, expected_tenure_number, transfer_id, checked_at)
SELECT 'expire', ${sql(input.expiredRequestId)}, predecessor_tenure_number, id, ${sql(input.createdAt)}
FROM operator_transfers WHERE state = 'expired' AND expired_at = ${sql(input.createdAt)};
INSERT INTO operator_transfers
  (id, predecessor_tenure_number, initiation_kind, successor_display_name, successor_email,
   successor_current_outpost_id, acceptance_token_hash, created_at, expires_at, state, request_id)
SELECT ${sql(input.transferId)}, active_tenure_number, 'recovery', ${sql(input.displayName)},
  ${sql(input.successorEmail)}, ${input.currentOutpostId ? sql(input.currentOutpostId) : 'NULL'},
  ${sql(input.tokenHash)}, ${sql(input.createdAt)}, ${sql(input.expiresAt)}, 'pending', ${sql(input.requestId)}
FROM operator_account WHERE singleton_key = 1 AND state = 'active'
  AND verified_email <> ${sql(input.successorEmail)};
INSERT INTO operator_transition_checks
  (transition_kind, request_id, transfer_id, checked_at)
VALUES ('recovery', ${sql(input.requestId)}, ${sql(input.transferId)}, ${sql(input.createdAt)});
`
}

export function validateRecoveryPreflight(output) {
  let statements
  try {
    statements = JSON.parse(output)
  } catch {
    throw new Error('Production integrity output was not valid Wrangler JSON.')
  }
  if (!Array.isArray(statements) || statements.length !== 4 || statements.some((item) => item?.success !== true)) {
    throw new Error('Production integrity checks did not all complete successfully.')
  }
  const assertionCount = statements[0]?.results?.[0]?.lifecycle_assertions
  const account = statements[1]?.results?.[0]
  const foreignKeyProblems = statements[2]?.results
  const prohibitedBirthColumns = statements[3]?.results?.[0]?.prohibited_birth_columns
  if (assertionCount !== 7) throw new Error('Migration 0008 lifecycle assertions are incomplete.')
  if (account?.state !== 'active' || !Number.isInteger(account.active_tenure_number)
    || account.current_tenure_open !== 1 || account.open_tenures !== 1) {
    throw new Error('The production Operator Account is not active with one current tenure.')
  }
  if (!Array.isArray(foreignKeyProblems) || foreignKeyProblems.length !== 0) {
    throw new Error('Production foreign-key integrity failed.')
  }
  if (prohibitedBirthColumns !== 0) throw new Error('Production schema contains a prohibited birth column.')
}

function wrangler(args, { capture = false } = {}) {
  const result = spawnSync(npx, ['wrangler', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  })
  if (result.status !== 0) throw new Error(capture ? `${result.stdout}\n${result.stderr}` : 'Wrangler command failed.')
  return capture ? result.stdout : ''
}

export async function runRecovery() {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Recovery must run in an interactive terminal.')
  const prompt = createInterface({ input: stdin, output: stdout })
  let temporary = ''
  try {
    stdout.write('\nRanger Outpost Hub — emergency recovery transfer\n')
    stdout.write('This stages the normal seven-day successor flow. It does not replace the current Operator.\n\n')
    const confirmation = await prompt.question('Type STAGE RECOVERY to continue: ')
    if (confirmation !== 'STAGE RECOVERY') throw new Error('Recovery staging cancelled.')

    const productionOrigin = await prompt.question('Production HTTPS origin: ')
    const displayName = await prompt.question('Successor Display Name: ')
    const successorEmail = await prompt.question('Successor verified Access email: ')
    const currentOutpostIdValue = await prompt.question('Existing Hub Outpost ID, or press Enter for No Current Outpost: ')
    const values = validateRecoveryInput({ productionOrigin, displayName, successorEmail })
    const currentOutpostId = currentOutpostIdValue.trim() || null

    stdout.write('\nChecking the explicit production configuration and migration integrity…\n')
    const config = spawnSync(process.execPath, ['scripts/production-config.mjs'], { cwd: projectRoot, stdio: 'inherit' })
    if (config.status !== 0) throw new Error('Production configuration check failed.')
    wrangler(['d1', 'migrations', 'list', 'ranger-outpost-hub-production', '--config', 'wrangler.jsonc', '--env', 'production', '--remote'])
    const integrityOutput = wrangler(['d1', 'execute', 'ranger-outpost-hub-production', '--config', 'wrangler.jsonc', '--env', 'production', '--remote',
      '--command', "SELECT COUNT(*) lifecycle_assertions FROM migration_0008_assertions WHERE passed = 1; SELECT state, active_tenure_number, EXISTS (SELECT 1 FROM operator_tenures tenure WHERE tenure.tenure_number = operator_account.active_tenure_number AND tenure.ended_at IS NULL) current_tenure_open, (SELECT COUNT(*) FROM operator_tenures WHERE ended_at IS NULL) open_tenures FROM operator_account WHERE singleton_key = 1; PRAGMA foreign_key_check; SELECT COUNT(*) prohibited_birth_columns FROM sqlite_schema schema, pragma_table_info(schema.name) column_info WHERE schema.type = 'table' AND (lower(column_info.name) LIKE '%birth%year%' OR lower(column_info.name) LIKE '%birth%date%');", '--json'], { capture: true })
    validateRecoveryPreflight(integrityOutput)
    stdout.write('Migration 0008 assertions, active-tenure state, foreign keys, and private schema passed.\n')
    stdout.write('\nCapturing the current production Time Travel bookmark. Do not paste it into chat or QA evidence.\n')
    wrangler(['d1', 'time-travel', 'info', 'ranger-outpost-hub-production', '--config', 'wrangler.jsonc', '--env', 'production'])
    const finalConfirmation = await prompt.question('\nType the production hostname to stage the recovery transfer: ')
    if (finalConfirmation !== new URL(values.productionOrigin).hostname) throw new Error('Production hostname confirmation did not match.')

    const token = randomBytes(32).toString('base64url')
    const now = new Date()
    const input = {
      ...values,
      currentOutpostId,
      transferId: randomUUID(),
      requestId: randomUUID(),
      expiredRequestId: randomUUID(),
      tokenHash: createHash('sha256').update(token).digest('hex'),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.valueOf() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
    }
    temporary = await mkdtemp(join(tmpdir(), 'ranger-operator-recovery-'))
    const sqlFile = join(temporary, 'stage-recovery.sql')
    await writeFile(sqlFile, recoverySql(input), { mode: 0o600 })
    wrangler(['d1', 'execute', 'ranger-outpost-hub-production', '--config', 'wrangler.jsonc', '--env', 'production', '--remote', '--file', sqlFile])

    stdout.write('\nRecovery transfer staged. Copy this link once, then close this terminal:\n')
    stdout.write(`${values.productionOrigin}/operator#transfer=${token}\n`)
    stdout.write('\nNext: add only the exact successor email temporarily to the existing Access Allow policy.\n')
    stdout.write('Keep the predecessor email until the successor completes adult-attested acceptance.\n')
  } finally {
    prompt.close()
    if (temporary) await rm(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRecovery().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Recovery staging failed.')
    process.exitCode = 1
  })
}
