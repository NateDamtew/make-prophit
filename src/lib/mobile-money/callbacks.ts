import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

import type { MobileMoneySettings } from '@/lib/mobile-money/settings'
import type { PawaPayClient } from '@/lib/pawapay/client'
import type { PawaPayTransactionRecord } from '@/lib/pawapay/types'

import { applyDepositStatus } from '@/lib/mobile-money/deposits'
import { PaymentIntentRepository } from '@/lib/mobile-money/intents'
import { applyPayoutStatus } from '@/lib/mobile-money/payouts'
import { getMobileMoneySettings } from '@/lib/mobile-money/settings'
import { getPawaPayClient } from '@/lib/pawapay/client'
import { signatureContextFromRequest, verifyCallbackSignature } from '@/lib/pawapay/signature'

/**
 * pawaPay callback processing, shared by the HTTP route and tests.
 *
 * Order of operations: size check → signature (unless explicitly allowed off) →
 * parse → record the event by body fingerprint (idempotency + audit) → find the
 * intent by provider_ref → apply the status under a row lock.
 *
 * Always answers 200 for well-formed callbacks we cannot match, so pawaPay
 * does not retry forever; the event is still recorded for the admin console.
 */

export const CALLBACK_MAX_BODY_BYTES = 64 * 1024

export type CallbackOutcome =
  | { status: 200; body: { ok: true; matched: boolean; duplicate?: boolean; action?: string } }
  | { status: 400 | 401 | 413 | 503; body: { error: string; reason?: string } }

export interface CallbackDependencies {
  settings?: MobileMoneySettings
  client?: PawaPayClient
  now?: () => number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function processPawaPayCallback(
  request: Request,
  rawBody: Uint8Array,
  deps: CallbackDependencies = {},
): Promise<CallbackOutcome> {
  if (rawBody.byteLength === 0) {
    return { status: 400, body: { error: 'Empty payload.' } }
  }
  if (rawBody.byteLength > CALLBACK_MAX_BODY_BYTES) {
    return { status: 413, body: { error: 'Payload too large.' } }
  }

  let settings: MobileMoneySettings
  try {
    settings = deps.settings ?? (await getMobileMoneySettings())
  } catch {
    return { status: 503, body: { error: 'Callback unavailable.' } }
  }

  const hasSignature = Boolean(request.headers.get('signature-input'))
  let signatureVerified = false
  let signatureKeyId: string | null = null
  if (hasSignature || !settings.allowUnsignedCallbacks) {
    const client = deps.client ?? getPawaPayClient()
    const verification = await verifyCallbackSignature({
      request: signatureContextFromRequest(request),
      rawBody,
      now: deps.now,
      getPublicKeyPem: async (keyId) => {
        let keys = await client.getPublicKeys()
        let match = keys.find((key) => key.id === keyId)
        if (!match && keyId) {
          keys = await client.getPublicKeys(true)
          match = keys.find((key) => key.id === keyId)
        }
        return match?.key ?? (keys.length === 1 && !keyId ? keys[0]!.key : null)
      },
    })
    if (!verification.ok) {
      console.warn('[mobile-money] rejected pawaPay callback', { reason: verification.reason })
      return { status: 401, body: { error: 'Invalid signature.', reason: verification.reason } }
    }
    signatureVerified = true
    signatureKeyId = verification.keyId ?? null
  }

  let payload: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(Buffer.from(rawBody).toString('utf8'))
    if (!isRecord(parsed)) {
      return { status: 400, body: { error: 'Invalid payload.' } }
    }
    payload = parsed
  } catch {
    return { status: 400, body: { error: 'Invalid payload.' } }
  }

  const depositId = typeof payload.depositId === 'string' ? payload.depositId : null
  const payoutId = typeof payload.payoutId === 'string' ? payload.payoutId : null
  const providerRef = depositId ?? payoutId
  const kind = depositId ? 'deposit' : payoutId ? 'payout' : null
  const status = typeof payload.status === 'string' ? payload.status : null
  const fingerprint = createHash('sha256').update(rawBody).digest('hex')

  const intent =
    providerRef && /^[0-9a-f-]{36}$/i.test(providerRef)
      ? await PaymentIntentRepository.getByProviderRef(providerRef)
      : null

  const isNew = await PaymentIntentRepository.recordCallbackEvent({
    fingerprint,
    intentId: intent?.id ?? null,
    providerRef: intent ? providerRef : null,
    kind,
    status,
    signatureKeyId,
    signatureVerified,
    payload,
  })
  if (!isNew) {
    return { status: 200, body: { ok: true, matched: Boolean(intent), duplicate: true } }
  }
  if (!intent || !kind || intent.kind !== kind) {
    console.warn('[mobile-money] callback for unknown intent', { providerRef, kind, status })
    return { status: 200, body: { ok: true, matched: false } }
  }

  const record = payload as unknown as PawaPayTransactionRecord
  const result =
    kind === 'deposit'
      ? await applyDepositStatus(intent.id, record, 'callback')
      : await applyPayoutStatus(intent.id, record, 'callback')
  return { status: 200, body: { ok: true, matched: true, action: result?.action } }
}
