import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { recoverySql, validateRecoveryInput, validateRecoveryPreflight } from './operator-recovery.mjs'
import { createMigratedD1 } from '../worker/test-sqlite-d1'
import { claimOperatorAccount, stageOperatorTransfer } from '../worker/operator-lifecycle-repository'

describe('production recovery staging', () => {
  it('normalizes interactive identity input and rejects ambiguous targets', () => {
    expect(validateRecoveryInput({
      productionOrigin: 'https://hub.example/', displayName: ' Successor ', successorEmail: ' NEXT@EXAMPLE.ORG ',
    })).toEqual({ productionOrigin: 'https://hub.example', displayName: 'Successor', successorEmail: 'next@example.org' })
    expect(() => validateRecoveryInput({
      productionOrigin: 'http://localhost', displayName: 'Successor', successorEmail: 'next@example.org',
    })).toThrow('HTTPS')
  })

  it('stages a recovery transfer without directly replacing or deleting the account', () => {
    const token = 'recovery-token-never-written'
    const statement = recoverySql({
      transferId: 'transfer-id', displayName: 'Successor', successorEmail: 'next@example.org',
      currentOutpostId: null, tokenHash: createHash('sha256').update(token).digest('hex'),
      createdAt: '2026-08-13T00:00:00.000Z', expiresAt: '2026-08-20T00:00:00.000Z',
      requestId: 'request-id', expiredRequestId: 'expired-request-id',
    })
    expect(statement).toContain("'recovery'")
    expect(statement).toContain('INSERT INTO operator_transfers')
    expect(statement).toContain("state = 'active'")
    expect(statement).not.toContain(token)
    expect(statement).not.toMatch(/UPDATE operator_account|DELETE FROM operator_account/i)
    expect(statement).toContain("state = 'expired'")
    expect(statement).toContain("'transfer-expired'")
  })

  it('fails closed unless migration assertions, active tenure, and foreign keys all pass', () => {
    const result = [
      { success: true, results: [{ lifecycle_assertions: 7 }] },
      { success: true, results: [{
        state: 'active', active_tenure_number: 1, current_tenure_open: 1, open_tenures: 1,
      }] },
      { success: true, results: [] },
      { success: true, results: [{ prohibited_birth_columns: 0 }] },
    ]
    expect(() => validateRecoveryPreflight(JSON.stringify(result))).not.toThrow()
    result[2].results.push({ table: 'operator_account', rowid: 1 })
    expect(() => validateRecoveryPreflight(JSON.stringify(result))).toThrow('foreign-key')
  })

  it('atomically expires a stale transfer before staging recovery without replacing the holder', async () => {
    const database = createMigratedD1()
    try {
      await claimOperatorAccount(database.db, {
        displayName: 'Current', email: 'current@example.org', currentOutpostId: null,
        confirmedAt: '2026-08-01T00:00:00.000Z', renewalDueAt: '2030-08-01T00:00:00.000Z',
        attestationVersion: 'operator-adult-v1', requestId: 'claim-request',
      })
      await stageOperatorTransfer(database.db, {
        transferId: 'stale-transfer', predecessor: { tenureNumber: 1, label: 'Operator tenure 1' },
        successorDisplayName: 'Stale', successorEmail: 'stale@example.org', successorCurrentOutpostId: null,
        tokenHash: 'a'.repeat(64), createdAt: '2026-08-01T01:00:00.000Z',
        expiresAt: '2026-08-08T01:00:00.000Z', requestId: 'stale-request', initiationKind: 'operator',
      })
      const statement = recoverySql({
        transferId: 'recovery-transfer', displayName: 'Recovery', successorEmail: 'recovery@example.org',
        currentOutpostId: null, tokenHash: 'b'.repeat(64), createdAt: '2026-08-13T00:00:00.000Z',
        expiresAt: '2026-08-20T00:00:00.000Z', requestId: 'recovery-request',
        expiredRequestId: 'stale-expired-request',
      })
      database.sqlite.exec('BEGIN IMMEDIATE;')
      try {
        database.sqlite.exec(statement)
        database.sqlite.exec('COMMIT;')
      } catch (error) {
        database.sqlite.exec('ROLLBACK;')
        throw error
      }

      expect(database.sqlite.prepare('SELECT state, verified_email FROM operator_account').get())
        .toEqual({ state: 'active', verified_email: 'current@example.org' })
      expect(database.sqlite.prepare('SELECT state, successor_email FROM operator_transfers WHERE id = ?').get('stale-transfer'))
        .toEqual({ state: 'expired', successor_email: null })
      expect(database.sqlite.prepare('SELECT state, initiation_kind FROM operator_transfers WHERE id = ?').get('recovery-transfer'))
        .toEqual({ state: 'pending', initiation_kind: 'recovery' })
    } finally {
      database.close()
    }
  })

  it('refuses to stage recovery to the already-active email', async () => {
    const database = createMigratedD1()
    try {
      await claimOperatorAccount(database.db, {
        displayName: 'Current', email: 'current@example.org', currentOutpostId: null,
        confirmedAt: '2026-08-01T00:00:00.000Z', renewalDueAt: '2030-08-01T00:00:00.000Z',
        attestationVersion: 'operator-adult-v1', requestId: 'claim-request-same-email',
      })
      const statement = recoverySql({
        transferId: 'same-email-recovery', displayName: 'Current', successorEmail: 'current@example.org',
        currentOutpostId: null, tokenHash: 'c'.repeat(64), createdAt: '2026-08-13T00:00:00.000Z',
        expiresAt: '2026-08-20T00:00:00.000Z', requestId: 'same-email-request',
        expiredRequestId: 'same-email-expired-request',
      })
      database.sqlite.exec('BEGIN IMMEDIATE;')
      expect(() => database.sqlite.exec(statement)).toThrow('transition conflict')
      database.sqlite.exec('ROLLBACK;')
      expect(database.sqlite.prepare(`SELECT COUNT(*) count FROM operator_transfers WHERE state = 'pending'`).get())
        .toEqual({ count: 0 })
    } finally {
      database.close()
    }
  })
})
