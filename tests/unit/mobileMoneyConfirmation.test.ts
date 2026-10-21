import { describe, expect, it } from 'bun:test'

import { issueConfirmationToken, verifyConfirmationToken } from '@/lib/mobile-money/confirmation'

const SECRET = 'test-secret'
const NOW = 1_760_000_000_000
const input = { userId: 'u1', msisdn: '254703456789', grossMinor: '30000', currency: 'KES' }

describe('withdrawal confirmation tokens', () => {
  it('round-trips a token bound to user, number, amount and currency', () => {
    const token = issueConfirmationToken(input, { secret: SECRET, now: () => NOW })
    const check = verifyConfirmationToken(token, input, { secret: SECRET, now: () => NOW + 1_000 })
    expect(check.ok).toBe(true)
    if (check.ok) {
      expect(check.payload.expiresAt).toBe(NOW + 5 * 60_000)
    }
  })

  it('rejects expiry, mismatch, tampering and the wrong secret', () => {
    const token = issueConfirmationToken(input, { secret: SECRET, now: () => NOW })
    expect(verifyConfirmationToken(token, input, { secret: SECRET, now: () => NOW + 6 * 60_000 })).toEqual({
      ok: false,
      reason: 'expired',
    })
    expect(
      verifyConfirmationToken(token, { ...input, grossMinor: '30001' }, { secret: SECRET, now: () => NOW }),
    ).toEqual({
      ok: false,
      reason: 'mismatch',
    })
    expect(
      verifyConfirmationToken(token, { ...input, msisdn: '254700000000' }, { secret: SECRET, now: () => NOW }),
    ).toEqual({
      ok: false,
      reason: 'mismatch',
    })
    expect(verifyConfirmationToken(token, input, { secret: 'other', now: () => NOW })).toEqual({
      ok: false,
      reason: 'bad_signature',
    })
    const [encoded, signature] = token.split('.')
    const tampered = `${Buffer.from(JSON.stringify({ ...input, expiresAt: NOW + 10_000_000 })).toString('base64url')}.${signature}`
    expect(verifyConfirmationToken(tampered, input, { secret: SECRET, now: () => NOW })).toEqual({
      ok: false,
      reason: 'bad_signature',
    })
    expect(verifyConfirmationToken(encoded!, input, { secret: SECRET, now: () => NOW })).toEqual({
      ok: false,
      reason: 'malformed',
    })
    expect(verifyConfirmationToken('', input, { secret: SECRET })).toEqual({ ok: false, reason: 'malformed' })
  })

  it('falls back to BETTER_AUTH_SECRET from env', () => {
    const env = { BETTER_AUTH_SECRET: 'env-secret' } as NodeJS.ProcessEnv
    const token = issueConfirmationToken(input, { env, now: () => NOW })
    expect(verifyConfirmationToken(token, input, { env, now: () => NOW }).ok).toBe(true)
    expect(() => issueConfirmationToken(input, { env: {} as NodeJS.ProcessEnv })).toThrow()
  })
})
