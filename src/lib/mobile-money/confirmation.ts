import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Withdrawal confirmation tokens. The preview step returns a short-lived token
 * bound to (user, number, amount, currency); the create step must present it.
 * This guarantees the user saw the exact fee/net breakdown for the exact
 * destination before money is held, and blocks blind or replayed submissions.
 * Stateless: HMAC over the payload with the auth secret.
 */

export interface ConfirmationPayload {
  userId: string
  msisdn: string
  grossMinor: string
  currency: string
  /** Unix ms. */
  expiresAt: number
}

const CONFIRMATION_TTL_MS = 5 * 60_000

function secretFromEnv(env: NodeJS.ProcessEnv): string | null {
  return env.MOBILE_MONEY_CONFIRMATION_SECRET?.trim() || env.BETTER_AUTH_SECRET?.trim() || null
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function issueConfirmationToken(
  input: Omit<ConfirmationPayload, 'expiresAt'>,
  options: { secret?: string; now?: () => number; ttlMs?: number; env?: NodeJS.ProcessEnv } = {},
): string {
  const secret = options.secret ?? secretFromEnv(options.env ?? process.env)
  if (!secret) {
    throw new Error('No confirmation secret configured (BETTER_AUTH_SECRET).')
  }
  const payload: ConfirmationPayload = {
    ...input,
    expiresAt: (options.now ?? Date.now)() + (options.ttlMs ?? CONFIRMATION_TTL_MS),
  }
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${encoded}.${sign(encoded, secret)}`
}

export type ConfirmationCheck =
  | { ok: true; payload: ConfirmationPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'mismatch' }

export function verifyConfirmationToken(
  token: string,
  expected: Omit<ConfirmationPayload, 'expiresAt'>,
  options: { secret?: string; now?: () => number; env?: NodeJS.ProcessEnv } = {},
): ConfirmationCheck {
  const secret = options.secret ?? secretFromEnv(options.env ?? process.env)
  if (!secret) {
    return { ok: false, reason: 'bad_signature' }
  }
  const dot = token.lastIndexOf('.')
  if (dot <= 0) {
    return { ok: false, reason: 'malformed' }
  }
  const encoded = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  const expectedSignature = sign(encoded, secret)
  const a = Buffer.from(signature)
  const b = Buffer.from(expectedSignature)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' }
  }
  let payload: ConfirmationPayload
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ConfirmationPayload
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (typeof payload.expiresAt !== 'number' || payload.expiresAt < (options.now ?? Date.now)()) {
    return { ok: false, reason: 'expired' }
  }
  if (
    payload.userId !== expected.userId ||
    payload.msisdn !== expected.msisdn ||
    payload.grossMinor !== expected.grossMinor ||
    payload.currency !== expected.currency
  ) {
    return { ok: false, reason: 'mismatch' }
  }
  return { ok: true, payload }
}
