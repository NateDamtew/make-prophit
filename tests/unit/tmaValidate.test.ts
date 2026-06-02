import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import { validateTelegramInitData } from '@/lib/tma/validate'

const ORIGINAL_ENV = { ...process.env }

function signInitData(botToken: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params)
  const dataCheckString = Array.from(search.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
  search.set('hash', hash)
  return search.toString()
}

describe('validateTelegramInitData', () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token-12345'
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('returns null when TELEGRAM_BOT_TOKEN is missing', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN
    const result = await validateTelegramInitData('user=%7B%22id%22%3A1%7D')
    expect(result).toBeNull()
  })

  it('returns null when hash is missing', async () => {
    const result = await validateTelegramInitData('user=%7B%22id%22%3A1%7D')
    expect(result).toBeNull()
  })

  it('returns null on hash mismatch', async () => {
    const initData = signInitData('different-token', {
      user: JSON.stringify({ id: 123, first_name: 'Test' }),
      auth_date: String(Math.floor(Date.now() / 1000)),
    })
    const result = await validateTelegramInitData(initData)
    expect(result).toBeNull()
  })

  it('returns null when auth_date is older than 24 hours', async () => {
    const oneDayAgo = Math.floor(Date.now() / 1000) - 86401
    const initData = signInitData('test-bot-token-12345', {
      user: JSON.stringify({ id: 123, first_name: 'Test' }),
      auth_date: String(oneDayAgo),
    })
    const result = await validateTelegramInitData(initData)
    expect(result).toBeNull()
  })

  it('returns null when user field is missing', async () => {
    const initData = signInitData('test-bot-token-12345', {
      auth_date: String(Math.floor(Date.now() / 1000)),
    })
    const result = await validateTelegramInitData(initData)
    expect(result).toBeNull()
  })

  it('returns parsed user data when signature is valid and fresh', async () => {
    const user = { id: 123, first_name: 'Nathan', username: 'natedamtew' }
    const authDate = Math.floor(Date.now() / 1000)
    const initData = signInitData('test-bot-token-12345', {
      user: JSON.stringify(user),
      auth_date: String(authDate),
    })

    const result = await validateTelegramInitData(initData)
    expect(result).not.toBeNull()
    expect(result?.user.id).toBe(123)
    expect(result?.user.first_name).toBe('Nathan')
    expect(result?.user.username).toBe('natedamtew')
    expect(result?.auth_date).toBe(authDate)
  })

  it('returns null on malformed user JSON', async () => {
    const initData = signInitData('test-bot-token-12345', {
      user: 'not-json',
      auth_date: String(Math.floor(Date.now() / 1000)),
    })
    const result = await validateTelegramInitData(initData)
    expect(result).toBeNull()
  })

  it('captures start_param if present', async () => {
    const user = { id: 123, first_name: 'Nathan' }
    const initData = signInitData('test-bot-token-12345', {
      user: JSON.stringify(user),
      auth_date: String(Math.floor(Date.now() / 1000)),
      start_param: 'community=ethiopian-traders',
    })

    const result = await validateTelegramInitData(initData)
    expect(result?.start_param).toBe('community=ethiopian-traders')
  })
})
