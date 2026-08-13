import { lifecycleStateAt, noticeOpensAt, type OperatorLifecycleState } from '../shared/operator-lifecycle'

export type OperatorPrincipal = {
  tenureNumber: number
  label: string
}

export type OperatorAccountView = {
  displayName: string
  email: string
  currentOutpost: { id: string; title: string } | null
  tenureNumber: number
  activatedAt: string
  renewalDueAt: string
  noticeOpensAt: string
  lifecycleState: OperatorLifecycleState
  adultEligibilityConfirmed: true
  accessCleanupRequired: boolean
  accessCleanupConfirmedAt: string | null
  version: number
}

export type OperatorAuthorization =
  | { role: 'unclaimed' }
  | { role: 'active'; principal: OperatorPrincipal; account: OperatorAccountView }
  | {
    role: 'pending-successor'
    transferId: string
    transfer: {
      displayName: string
      currentOutpost: { id: string; title: string } | null
      expiresAt: string
    }
  }
  | { role: 'none' }

type AccountRow = {
  state: 'unclaimed' | 'active'
  display_name: string | null
  verified_email: string | null
  current_outpost_id: string | null
  current_outpost_title: string | null
  active_tenure_number: number | null
  activated_at: string | null
  renewal_due_at: string | null
  access_cleanup_required: number
  access_cleanup_confirmed_at: string | null
  version: number
}

type TransferRow = {
  id: string
  successor_display_name: string
  successor_email?: string
  successor_current_outpost_id: string | null
  successor_current_outpost_title: string | null
  created_at?: string
  expires_at: string
  initiation_kind?: 'operator' | 'recovery'
}

function principal(tenureNumber: number): OperatorPrincipal {
  return { tenureNumber, label: `Operator tenure ${tenureNumber}` }
}

function accountView(row: AccountRow, now: string): OperatorAccountView {
  if (
    row.state !== 'active' || !row.display_name || !row.verified_email
    || !row.active_tenure_number || !row.activated_at || !row.renewal_due_at
  ) throw new Error('The Operator Account is inconsistent.')
  return {
    displayName: row.display_name,
    email: row.verified_email,
    currentOutpost: row.current_outpost_id && row.current_outpost_title
      ? { id: row.current_outpost_id, title: row.current_outpost_title }
      : null,
    tenureNumber: row.active_tenure_number,
    activatedAt: row.activated_at,
    renewalDueAt: row.renewal_due_at,
    noticeOpensAt: noticeOpensAt(row.renewal_due_at),
    lifecycleState: lifecycleStateAt(row.renewal_due_at, now),
    adultEligibilityConfirmed: true,
    accessCleanupRequired: row.access_cleanup_required === 1,
    accessCleanupConfirmedAt: row.access_cleanup_confirmed_at,
    version: row.version,
  }
}

export async function authorizeOperatorIdentity(
  db: D1Database,
  email: string,
  now: string,
): Promise<OperatorAuthorization> {
  const state = await db.prepare('SELECT state FROM operator_account WHERE singleton_key = 1')
    .first<Pick<AccountRow, 'state'>>()
  if (!state) throw new Error('The Operator Account singleton is missing.')
  if (state.state === 'unclaimed') return { role: 'unclaimed' }
  const activeMatch = await db.prepare(`SELECT account.active_tenure_number FROM operator_account account
    JOIN operator_tenures tenure ON tenure.tenure_number = account.active_tenure_number
      AND tenure.ended_at IS NULL
    WHERE account.singleton_key = 1 AND account.state = 'active' AND account.verified_email = ?`)
    .bind(email).first<Pick<AccountRow, 'active_tenure_number'>>()
  if (activeMatch?.active_tenure_number) {
    const account = await db.prepare(`SELECT account.state, account.display_name, account.verified_email,
      account.current_outpost_id, account.active_tenure_number,
      account.activated_at, account.renewal_due_at, account.access_cleanup_required,
      account.access_cleanup_confirmed_at, account.version
      FROM operator_account account
      JOIN operator_tenures tenure ON tenure.tenure_number = account.active_tenure_number
        AND tenure.ended_at IS NULL
      WHERE account.singleton_key = 1 AND account.state = 'active'
        AND account.verified_email = ? AND account.active_tenure_number = ?`)
      .bind(email, activeMatch.active_tenure_number).first<AccountRow>()
    if (!account) return { role: 'none' }
    if (account.current_outpost_id) {
      const outpost = await db.prepare('SELECT title FROM content_records WHERE id = ?')
        .bind(account.current_outpost_id).first<{ title: string }>()
      account.current_outpost_title = outpost?.title ?? null
    }
    return {
      role: 'active',
      principal: principal(activeMatch.active_tenure_number),
      account: accountView(account, now),
    }
  }
  const transfer = await db.prepare(`SELECT transfer.id, transfer.successor_display_name,
    transfer.successor_current_outpost_id,
    transfer.expires_at FROM operator_transfers transfer
    WHERE transfer.state = 'pending' AND transfer.successor_email = ? AND transfer.expires_at > ?
    LIMIT 1`).bind(email, now).first<TransferRow>()
  if (!transfer) return { role: 'none' }
  if (transfer.successor_current_outpost_id) {
    const outpost = await db.prepare('SELECT title FROM content_records WHERE id = ?')
      .bind(transfer.successor_current_outpost_id).first<{ title: string }>()
    transfer.successor_current_outpost_title = outpost?.title ?? null
  }
  return {
    role: 'pending-successor',
    transferId: transfer.id,
    transfer: {
      displayName: transfer.successor_display_name,
      currentOutpost: transfer.successor_current_outpost_id && transfer.successor_current_outpost_title
        ? { id: transfer.successor_current_outpost_id, title: transfer.successor_current_outpost_title }
        : null,
      expiresAt: transfer.expires_at,
    },
  }
}

export async function claimOperatorAccount(db: D1Database, input: {
  displayName: string
  email: string
  currentOutpostId: string | null
  confirmedAt: string
  renewalDueAt: string
  attestationVersion: string
  requestId: string
}) {
  await db.batch([
    db.prepare(`INSERT INTO operator_tenures (tenure_number, started_at)
      SELECT 1, ? FROM operator_account WHERE singleton_key = 1 AND state = 'unclaimed'`)
      .bind(input.confirmedAt),
    db.prepare(`INSERT INTO operator_adult_eligibility
      (tenure_number, confirmed, confirmed_at, attestation_version)
      SELECT 1, 1, ?, ? FROM operator_tenures tenure
      JOIN operator_account account ON account.singleton_key = 1 AND account.state = 'unclaimed'
      WHERE tenure.tenure_number = 1 AND tenure.started_at = ?`)
      .bind(input.confirmedAt, input.attestationVersion, input.confirmedAt),
    db.prepare(`UPDATE operator_account SET state = 'active', display_name = ?, verified_email = ?,
      current_outpost_id = ?, active_tenure_number = 1, eligibility_confirmed = 1,
      eligibility_confirmed_at = ?, attestation_version = ?, activated_at = ?, renewal_due_at = ?,
      version = 1 WHERE singleton_key = 1 AND state = 'unclaimed'`)
      .bind(input.displayName, input.email, input.currentOutpostId, input.confirmedAt,
        input.attestationVersion, input.confirmedAt, input.renewalDueAt),
    db.prepare(`INSERT INTO privileged_access_events
      (action, actor_tenure_number, subject_tenure_number, request_id, created_at)
      SELECT 'account-claimed', 1, 1, ?, ? FROM operator_account
      WHERE singleton_key = 1 AND state = 'active' AND verified_email = ? AND active_tenure_number = 1`)
      .bind(input.requestId, input.confirmedAt, input.email),
    db.prepare(`INSERT INTO operator_transition_checks
      (transition_kind, request_id, expected_email, expected_tenure_number, checked_at)
      VALUES ('claim', ?, ?, 1, ?)`).bind(input.requestId, input.email, input.confirmedAt),
  ])
}

export async function renewOperatorAccount(db: D1Database, input: {
  principal: OperatorPrincipal
  priorDueAt: string
  newDueAt: string
  confirmedAt: string
  requestId: string
}) {
  await db.batch([
    db.prepare(`INSERT INTO operator_renewal_events
      (tenure_number, prior_due_at, new_due_at, confirmed_at, actor_tenure_number, request_id)
      SELECT active_tenure_number, renewal_due_at, ?, ?, active_tenure_number, ?
      FROM operator_account WHERE singleton_key = 1 AND state = 'active'
        AND active_tenure_number = ? AND renewal_due_at = ?`)
      .bind(input.newDueAt, input.confirmedAt, input.requestId, input.principal.tenureNumber, input.priorDueAt),
    db.prepare(`UPDATE operator_account SET renewal_due_at = ?, version = version + 1
      WHERE singleton_key = 1 AND state = 'active' AND active_tenure_number = ? AND renewal_due_at = ?`)
      .bind(input.newDueAt, input.principal.tenureNumber, input.priorDueAt),
    db.prepare(`UPDATE operator_renewal_notices SET acknowledged_at = ?
      WHERE tenure_number = ? AND due_at = ? AND acknowledged_at IS NULL`)
      .bind(input.confirmedAt, input.principal.tenureNumber, input.priorDueAt),
    db.prepare(`INSERT INTO privileged_access_events
      (action, actor_tenure_number, subject_tenure_number, request_id, created_at)
      SELECT 'renewed', active_tenure_number, active_tenure_number, ?, ? FROM operator_account
      WHERE singleton_key = 1 AND active_tenure_number = ? AND renewal_due_at = ?`)
      .bind(input.requestId, input.confirmedAt, input.principal.tenureNumber, input.newDueAt),
    db.prepare(`INSERT INTO operator_transition_checks
      (transition_kind, request_id, expected_tenure_number, expected_due_at, checked_at)
      VALUES ('renew', ?, ?, ?, ?)`)
      .bind(input.requestId, input.principal.tenureNumber, input.newDueAt, input.confirmedAt),
  ])
}

export async function stageOperatorTransfer(db: D1Database, input: {
  transferId: string
  predecessor: OperatorPrincipal
  successorDisplayName: string
  successorEmail: string
  successorCurrentOutpostId: string | null
  tokenHash: string
  createdAt: string
  expiresAt: string
  requestId: string
  initiationKind: 'operator' | 'recovery'
}) {
  const statements = [
    db.prepare(`INSERT INTO operator_transfers
      (id, predecessor_tenure_number, initiation_kind, successor_display_name, successor_email,
       successor_current_outpost_id, acceptance_token_hash, created_at, expires_at, state, request_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
      .bind(input.transferId, input.predecessor.tenureNumber, input.initiationKind,
        input.successorDisplayName, input.successorEmail, input.successorCurrentOutpostId,
        input.tokenHash, input.createdAt, input.expiresAt, input.requestId),
  ]
  if (input.initiationKind === 'operator') {
    statements.push(db.prepare(`INSERT INTO privileged_access_events
      (action, actor_tenure_number, transfer_id, request_id, created_at)
      VALUES ('transfer-started', ?, ?, ?, ?)`)
      .bind(input.predecessor.tenureNumber, input.transferId, input.requestId, input.createdAt))
  }
  await db.batch(statements)
}

export async function cancelOperatorTransfer(db: D1Database, input: {
  transferId: string
  principal: OperatorPrincipal
  cancelledAt: string
  requestId: string
}) {
  await db.batch([
    db.prepare(`UPDATE operator_transfers SET state = 'cancelled', successor_display_name = NULL,
      successor_email = NULL, successor_current_outpost_id = NULL, acceptance_token_hash = NULL,
      cancelled_at = ? WHERE id = ? AND state = 'pending' AND predecessor_tenure_number = ?`)
      .bind(input.cancelledAt, input.transferId, input.principal.tenureNumber),
    db.prepare(`INSERT INTO privileged_access_events
      (action, actor_tenure_number, transfer_id, request_id, created_at)
      SELECT 'transfer-cancelled', predecessor_tenure_number, id, ?, ?
      FROM operator_transfers WHERE id = ? AND state = 'cancelled' AND cancelled_at = ?`)
      .bind(input.requestId, input.cancelledAt, input.transferId, input.cancelledAt),
    db.prepare(`INSERT INTO operator_transition_checks
      (transition_kind, request_id, expected_tenure_number, transfer_id, checked_at)
      VALUES ('cancel', ?, ?, ?, ?)`)
      .bind(input.requestId, input.principal.tenureNumber, input.transferId, input.cancelledAt),
  ])
}

export async function expireOperatorTransfer(db: D1Database, input: {
  transferId: string
  predecessorTenureNumber: number
  expiredAt: string
  requestId: string
}) {
  await db.batch([
    db.prepare(`UPDATE operator_transfers SET state = 'expired', successor_display_name = NULL,
      successor_email = NULL, successor_current_outpost_id = NULL, acceptance_token_hash = NULL,
      expired_at = ? WHERE id = ? AND state = 'pending' AND predecessor_tenure_number = ? AND expires_at <= ?`)
      .bind(input.expiredAt, input.transferId, input.predecessorTenureNumber, input.expiredAt),
    db.prepare(`INSERT INTO privileged_access_events
      (action, actor_tenure_number, transfer_id, request_id, created_at)
      SELECT 'transfer-expired', predecessor_tenure_number, id, ?, ?
      FROM operator_transfers WHERE id = ? AND state = 'expired' AND expired_at = ?`)
      .bind(input.requestId, input.expiredAt, input.transferId, input.expiredAt),
    db.prepare(`INSERT INTO operator_transition_checks
      (transition_kind, request_id, expected_tenure_number, transfer_id, checked_at)
      VALUES ('expire', ?, ?, ?, ?)`)
      .bind(input.requestId, input.predecessorTenureNumber, input.transferId, input.expiredAt),
  ])
}

export async function acceptOperatorTransfer(db: D1Database, input: {
  transferId: string
  successorEmail: string
  tokenHash: string
  acceptedAt: string
  renewalDueAt: string
  attestationVersion: string
  requestId: string
}) {
  await db.batch([
    db.prepare(`INSERT INTO operator_acceptance_guards
      (request_id, transfer_id, predecessor_tenure_number, successor_email, token_hash, accepted_at)
      SELECT ?, transfer.id, transfer.predecessor_tenure_number, transfer.successor_email,
        transfer.acceptance_token_hash, ?
      FROM operator_transfers transfer
      JOIN operator_account account ON account.active_tenure_number = transfer.predecessor_tenure_number
      JOIN operator_tenures tenure ON tenure.tenure_number = transfer.predecessor_tenure_number
        AND tenure.ended_at IS NULL
      WHERE transfer.id = ? AND transfer.state = 'pending' AND transfer.successor_email = ?
        AND transfer.acceptance_token_hash = ? AND transfer.expires_at > ?`)
      .bind(input.requestId, input.acceptedAt, input.transferId, input.successorEmail,
        input.tokenHash, input.acceptedAt),
    db.prepare(`UPDATE operator_tenures SET ended_at = ?, ending_event = 'accepted-transfer'
      WHERE tenure_number = (
        SELECT transfer.predecessor_tenure_number FROM operator_transfers transfer
        JOIN operator_account account ON account.active_tenure_number = transfer.predecessor_tenure_number
        WHERE transfer.id = ? AND transfer.state = 'pending' AND transfer.successor_email = ?
          AND transfer.acceptance_token_hash = ? AND transfer.expires_at > ?
      ) AND ended_at IS NULL`)
      .bind(input.acceptedAt, input.transferId, input.successorEmail, input.tokenHash, input.acceptedAt),
    db.prepare(`INSERT INTO operator_tenures (tenure_number, started_at)
      SELECT transfer.predecessor_tenure_number + 1, ? FROM operator_transfers transfer
      JOIN operator_account account ON account.active_tenure_number = transfer.predecessor_tenure_number
      WHERE transfer.id = ? AND transfer.state = 'pending' AND transfer.successor_email = ?
        AND transfer.acceptance_token_hash = ? AND transfer.expires_at > ?`)
      .bind(input.acceptedAt, input.transferId, input.successorEmail, input.tokenHash, input.acceptedAt),
    db.prepare(`INSERT INTO operator_adult_eligibility
      (tenure_number, confirmed, confirmed_at, attestation_version)
      SELECT transfer.predecessor_tenure_number + 1, 1, ?, ? FROM operator_transfers transfer
      JOIN operator_tenures tenure ON tenure.tenure_number = transfer.predecessor_tenure_number + 1
      WHERE transfer.id = ? AND transfer.state = 'pending' AND transfer.successor_email = ?
        AND transfer.acceptance_token_hash = ? AND transfer.expires_at > ? AND tenure.started_at = ?`)
      .bind(input.acceptedAt, input.attestationVersion, input.transferId, input.successorEmail,
        input.tokenHash, input.acceptedAt, input.acceptedAt),
    db.prepare(`UPDATE operator_account SET
      display_name = (SELECT successor_display_name FROM operator_transfers WHERE id = ?),
      verified_email = ?,
      current_outpost_id = (SELECT successor_current_outpost_id FROM operator_transfers WHERE id = ?),
      active_tenure_number = (SELECT predecessor_tenure_number + 1 FROM operator_transfers WHERE id = ?),
      eligibility_confirmed = 1, eligibility_confirmed_at = ?, attestation_version = ?,
      activated_at = ?, renewal_due_at = ?, access_cleanup_required = 1,
      access_cleanup_confirmed_at = NULL, version = version + 1
      WHERE singleton_key = 1 AND active_tenure_number = (
        SELECT predecessor_tenure_number FROM operator_transfers
        WHERE id = ? AND state = 'pending' AND successor_email = ?
          AND acceptance_token_hash = ? AND expires_at > ?
      )`)
      .bind(input.transferId, input.successorEmail, input.transferId, input.transferId,
        input.acceptedAt, input.attestationVersion, input.acceptedAt, input.renewalDueAt,
        input.transferId, input.successorEmail, input.tokenHash, input.acceptedAt),
    db.prepare(`UPDATE operator_transfers SET state = 'accepted', accepted_at = ?,
      successor_tenure_number = predecessor_tenure_number + 1, successor_display_name = NULL,
      successor_email = NULL, successor_current_outpost_id = NULL, acceptance_token_hash = NULL
      WHERE id = ? AND state = 'pending' AND successor_email = ?
        AND acceptance_token_hash = ? AND expires_at > ?`)
      .bind(input.acceptedAt, input.transferId, input.successorEmail, input.tokenHash, input.acceptedAt),
    db.prepare(`INSERT INTO privileged_access_events
      (action, actor_tenure_number, subject_tenure_number, transfer_id, request_id, created_at)
      SELECT 'transfer-accepted', successor_tenure_number, successor_tenure_number, id, ?, ?
      FROM operator_transfers WHERE id = ? AND state = 'accepted' AND accepted_at = ?`)
      .bind(input.requestId, input.acceptedAt, input.transferId, input.acceptedAt),
    db.prepare(`INSERT INTO operator_transition_checks
      (transition_kind, request_id, expected_email, expected_tenure_number, transfer_id, checked_at)
      SELECT 'accept', ?, ?, predecessor_tenure_number + 1, id, ?
      FROM operator_transfers WHERE id = ?`)
      .bind(input.requestId, input.successorEmail, input.acceptedAt, input.transferId),
    db.prepare('DELETE FROM operator_acceptance_guards WHERE request_id = ?')
      .bind(input.requestId),
  ])
}

export async function updateOperatorSettings(db: D1Database, input: {
  principal: OperatorPrincipal
  displayName: string
  currentOutpostId: string | null
  expectedVersion: number
  updatedAt: string
  requestId: string
}) {
  await db.batch([
    db.prepare(`INSERT INTO privileged_access_events
      (action, actor_tenure_number, subject_tenure_number, request_id, created_at)
      SELECT 'settings-updated', active_tenure_number, active_tenure_number, ?, ?
      FROM operator_account WHERE singleton_key = 1 AND state = 'active'
        AND active_tenure_number = ? AND version = ?`)
      .bind(input.requestId, input.updatedAt, input.principal.tenureNumber, input.expectedVersion),
    db.prepare(`UPDATE operator_account SET display_name = ?, current_outpost_id = ?, version = version + 1
      WHERE singleton_key = 1 AND state = 'active' AND active_tenure_number = ? AND version = ?`)
      .bind(input.displayName, input.currentOutpostId, input.principal.tenureNumber, input.expectedVersion),
    db.prepare(`INSERT INTO operator_transition_checks
      (transition_kind, request_id, expected_tenure_number, checked_at)
      VALUES ('settings', ?, ?, ?)`)
      .bind(input.requestId, input.principal.tenureNumber, input.updatedAt),
  ])
}

export async function confirmAccessCleanup(db: D1Database, input: {
  principal: OperatorPrincipal
  confirmedAt: string
  requestId: string
}) {
  await db.batch([
    db.prepare(`UPDATE operator_account SET access_cleanup_required = 0,
      access_cleanup_confirmed_at = ?, version = version + 1
      WHERE singleton_key = 1 AND state = 'active' AND active_tenure_number = ?
        AND access_cleanup_required = 1`)
      .bind(input.confirmedAt, input.principal.tenureNumber),
    db.prepare(`INSERT INTO privileged_access_events
      (action, actor_tenure_number, subject_tenure_number, request_id, created_at)
      SELECT 'access-cleanup-confirmed', active_tenure_number, active_tenure_number, ?, ?
      FROM operator_account WHERE singleton_key = 1 AND active_tenure_number = ?
        AND access_cleanup_required = 0 AND access_cleanup_confirmed_at = ?`)
      .bind(input.requestId, input.confirmedAt, input.principal.tenureNumber, input.confirmedAt),
    db.prepare(`INSERT INTO operator_transition_checks
      (transition_kind, request_id, expected_tenure_number, checked_at)
      VALUES ('cleanup', ?, ?, ?)`)
      .bind(input.requestId, input.principal.tenureNumber, input.confirmedAt),
  ])
}

export async function recordRenewalNotice(db: D1Database, account: OperatorAccountView, now: string) {
  if (account.lifecycleState === 'active') return
  await db.prepare(`INSERT OR IGNORE INTO operator_renewal_notices
    (tenure_number, due_at, opened_at, first_recorded_at) VALUES (?, ?, ?, ?)`)
    .bind(account.tenureNumber, account.renewalDueAt, account.noticeOpensAt, now).run()
}

export async function getPendingTransferForActive(db: D1Database, principalValue: OperatorPrincipal) {
  const transfer = await db.prepare(`SELECT transfer.id, transfer.successor_display_name,
    transfer.successor_email, transfer.successor_current_outpost_id,
    content.title successor_current_outpost_title, transfer.created_at, transfer.expires_at,
    transfer.initiation_kind FROM operator_transfers transfer
    LEFT JOIN content_records content ON content.id = transfer.successor_current_outpost_id
    WHERE transfer.state = 'pending' AND transfer.predecessor_tenure_number = ? LIMIT 1`)
    .bind(principalValue.tenureNumber).first<TransferRow>()
  if (!transfer) return null
  return {
    id: transfer.id,
    displayName: transfer.successor_display_name,
    email: transfer.successor_email!,
    currentOutpost: transfer.successor_current_outpost_id && transfer.successor_current_outpost_title
      ? { id: transfer.successor_current_outpost_id, title: transfer.successor_current_outpost_title }
      : null,
    createdAt: transfer.created_at!,
    expiresAt: transfer.expires_at,
    initiationKind: transfer.initiation_kind!,
  }
}

export async function listOperatorOutposts(db: D1Database, query: string) {
  const pattern = `%${query.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
  const rows = await db.prepare(`SELECT outpost.content_id id, content.title
    FROM outposts outpost JOIN content_records content ON content.id = outpost.content_id
    WHERE content.status = 'published' AND (? = '' OR content.title LIKE ? ESCAPE '\\')
    ORDER BY content.title COLLATE NOCASE, outpost.content_id LIMIT 20`)
    .bind(query, pattern).all<{ id: string; title: string }>()
  return rows.results
}

export async function createReauthenticationIntent(db: D1Database, input: {
  tokenHash: string
  principal: OperatorPrincipal
  intendedAction: 'renew' | 'transfer' | 'settings'
  createdAt: string
  expiresAt: string
}) {
  await db.prepare(`INSERT INTO operator_reauthentication_intents
    (token_hash, tenure_number, intended_action, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(input.tokenHash, input.principal.tenureNumber, input.intendedAction, input.createdAt, input.expiresAt)
    .run()
}

export async function consumeReauthenticationIntent(db: D1Database, input: {
  tokenHash: string
  principal: OperatorPrincipal
  intendedAction: 'renew' | 'transfer' | 'settings'
  accessIssuedAt: number
  consumedAt: string
}) {
  const intent = await db.prepare(`SELECT created_at, expires_at FROM operator_reauthentication_intents
    WHERE token_hash = ? AND tenure_number = ? AND intended_action = ?
      AND consumed_at IS NULL AND expires_at >= ?`)
    .bind(input.tokenHash, input.principal.tenureNumber, input.intendedAction, input.consumedAt)
    .first<{ created_at: string; expires_at: string }>()
  if (!intent || input.accessIssuedAt * 1_000 < new Date(intent.created_at).valueOf()) return false
  const result = await db.prepare(`UPDATE operator_reauthentication_intents SET consumed_at = ?
    WHERE token_hash = ? AND tenure_number = ? AND intended_action = ? AND consumed_at IS NULL`)
    .bind(input.consumedAt, input.tokenHash, input.principal.tenureNumber, input.intendedAction).run()
  return Number(result.meta.changes ?? 0) === 1
}
