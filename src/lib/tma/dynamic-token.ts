import { Buffer } from 'node:buffer'
import { createHash, createHmac } from 'node:crypto'

/**
 * Mints the `telegramAuthToken` JWT that Dynamic's `telegramSignIn()` expects,
 * matching Dynamic's reference bot exactly
 * (dynamic-labs/telegram-miniapp-dynamic — scripts/bot.ts). Dynamic validates
 * the token using only the bot token (JWT HS256 signature + an inner Login-
 * Widget-style hash), so we can produce it in our own backend from already-
 * validated initData instead of running a separate Telegram bot server.
 */

export interface DynamicTelegramUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Telegram Login Widget data-check hash: HMAC-SHA256 over the sorted
 * `key=value` data-check string, keyed by SHA-256 of the bot token. (This is
 * the Login Widget scheme bot.ts uses — NOT the Mini App "WebAppData" scheme
 * used to validate initData itself.)
 */
function generateTelegramHash(useData: Record<string, string>, botToken: string): string {
  const dataCheckString = Object.entries(useData)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .sort((a, b) => a.localeCompare(b))
    .join('\n')

  const secret = createHash('sha256').update(botToken).digest()
  return createHmac('sha256', secret).update(dataCheckString).digest('hex')
}

export function mintDynamicTelegramToken(params: {
  user: DynamicTelegramUser
  botToken: string
  /**
   * Telegram auth_date as Unix SECONDS (the Telegram standard). Dynamic's
   * reference bot.ts uses ms, but that trips a not-in-the-future check on the
   * backend; seconds is the standard Login-Widget format. Overridable for tests.
   */
  authDateSec?: number
  /** Overridable for deterministic tests. */
  issuedAtSec?: number
}): string {
  const authDate = params.authDateSec ?? Math.floor(Date.now() / 1000)
  const userData = {
    authDate,
    firstName: params.user.first_name ?? '',
    lastName: params.user.last_name ?? '',
    username: params.user.username ?? '',
    id: params.user.id,
    photoURL: params.user.photo_url ?? '',
  }

  const hash = generateTelegramHash({
    auth_date: String(userData.authDate),
    first_name: userData.firstName,
    id: String(userData.id),
    last_name: userData.lastName,
    photo_url: userData.photoURL,
    username: userData.username,
  }, params.botToken)

  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = { ...userData, hash, iat: params.issuedAtSec ?? Math.floor(Date.now() / 1000) }

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const signature = createHmac('sha256', params.botToken).update(signingInput).digest()
  return `${signingInput}.${base64url(signature)}`
}
