import { Buffer } from 'node:buffer'
import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { mintDynamicTelegramToken } from '@/lib/tma/dynamic-token'

const BOT_TOKEN = '123456:TEST-bot-token-abcdef'
const USER = { id: 987654321, first_name: 'Ada', last_name: 'Lovelace', username: 'ada', photo_url: '' }
const AUTH_DATE_MS = 1_750_000_000_000
const IAT = 1_750_000_000

function decode(part: string) {
  return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
}

// Independent re-implementation of Dynamic's bot.ts hash, to pin the format.
function expectedHash() {
  const useData: Record<string, string> = {
    auth_date: String(AUTH_DATE_MS),
    first_name: 'Ada',
    id: String(USER.id),
    last_name: 'Lovelace',
    username: 'ada',
  } // photo_url omitted: empty values are filtered out
  const dataCheckString = Object.entries(useData)
    .map(([k, v]) => `${k}=${v}`)
    .sort((a, b) => a.localeCompare(b))
    .join('\n')
  const secret = createHash('sha256').update(BOT_TOKEN).digest()
  return createHmac('sha256', secret).update(dataCheckString).digest('hex')
}

describe('mintDynamicTelegramToken', () => {
  const token = mintDynamicTelegramToken({ user: USER, botToken: BOT_TOKEN, authDateMs: AUTH_DATE_MS, issuedAtSec: IAT })
  const [headerB64, payloadB64, sigB64] = token.split('.')

  it('produces a 3-part HS256 JWT', () => {
    expect(token.split('.')).toHaveLength(3)
    expect(decode(headerB64)).toEqual({ alg: 'HS256', typ: 'JWT' })
  })

  it('carries the camelCase user payload + computed hash', () => {
    const payload = decode(payloadB64)
    expect(payload).toMatchObject({
      authDate: AUTH_DATE_MS,
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      id: USER.id,
      photoURL: '',
      iat: IAT,
    })
    expect(payload.hash).toBe(expectedHash())
  })

  it('signs with the bot token (HS256 over header.payload)', () => {
    const expectedSig = createHmac('sha256', BOT_TOKEN)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(sigB64).toBe(expectedSig)
  })
})
