import { sha256 } from './sha256.ts'

export type OrdinaryAuthEmailEnv = {
  AUTH_EMAIL_PROVIDER?: string
  AUTH_EMAIL_FROM?: string
  RESEND_API_KEY?: string
  LOCAL_AUTH_EMAIL_PREVIEW?: string
}

export type AuthEmailPurpose = 'verification' | 'password-reset' | 'renewal-warning'

export type AuthEmailConfiguration =
  | { mode: 'local-preview' }
  | { mode: 'resend'; sender: string; apiKey: string }

export class EmailDeliveryError extends Error {
  readonly retryable: boolean
  readonly category: 'transient' | 'rejected' | 'timeout'

  constructor(category: EmailDeliveryError['category']) {
    super('Transactional email delivery was not accepted.')
    this.category = category
    this.retryable = category !== 'rejected'
  }
}

type AuthEmailMessage = {
  authUserId: string
  to: string
  url: string
  purpose: AuthEmailPurpose
  idempotencyKey?: string
}

export async function deliverAuthEmail(
  db: D1Database,
  configuration: AuthEmailConfiguration,
  message: AuthEmailMessage,
  fetcher: typeof fetch = fetch,
) {
  if (configuration.mode === 'local-preview') {
    const now = new Date()
    await db.prepare(`INSERT INTO local_auth_email_previews
      (id, auth_user_id, purpose, one_time_url, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(), message.authUserId, message.purpose, message.url,
        now.toISOString(), new Date(now.valueOf() + 60 * 60 * 1_000).toISOString(),
      )
      .run()
    return { providerRequestFingerprint: await sha256(`local-preview:${message.idempotencyKey ?? crypto.randomUUID()}`) }
  }

  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${configuration.apiKey}`,
        'content-type': 'application/json',
        ...(message.idempotencyKey ? { 'idempotency-key': message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: configuration.sender,
        to: [message.to],
        subject: message.purpose === 'verification'
          ? 'Verify your Ranger Outpost Hub sign-in email'
          : message.purpose === 'password-reset'
            ? 'Reset your Ranger Outpost Hub password'
            : 'Renew your Ranger Outpost Hub Account',
        text: message.purpose === 'verification'
          ? `Open this one-time link to verify your sign-in email:\n\n${message.url}\n\nIf you did not create this account, ignore this message.`
          : message.purpose === 'password-reset'
            ? `Open this one-time link to choose a new Ranger Outpost Hub password:\n\n${message.url}\n\nIf you did not request this, ignore this message.`
            : `Your private Ranger Outpost Hub Account is approaching its access due date. Open the normal Account page to review and renew it:\n\n${message.url}\n\nThis link contains no sign-in credential.`,
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new EmailDeliveryError(response.status === 429 || response.status >= 500 ? 'transient' : 'rejected')
    }
    return { providerRequestFingerprint: await sha256(`resend:${message.idempotencyKey ?? ''}`) }
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error
    throw new EmailDeliveryError(controller.signal.aborted ? 'timeout' : 'transient')
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export async function consumeLocalEmailPreview(db: D1Database, purpose: AuthEmailPurpose, now = new Date()) {
  const preview = await db.prepare(`SELECT id, one_time_url
    FROM local_auth_email_previews
    WHERE purpose = ? AND consumed_at IS NULL AND expires_at > ?
    ORDER BY created_at DESC, id DESC LIMIT 1`)
    .bind(purpose, now.toISOString())
    .first<{ id: string; one_time_url: string }>()
  if (!preview) return null
  const consumed = await db.prepare(`UPDATE local_auth_email_previews SET consumed_at = ?
    WHERE id = ? AND consumed_at IS NULL AND expires_at > ?`)
    .bind(now.toISOString(), preview.id, now.toISOString())
    .run()
  return (consumed.meta.changes ?? 0) === 1 ? preview.one_time_url : null
}
