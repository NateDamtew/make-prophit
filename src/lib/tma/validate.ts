'use server'

import { createHmac } from 'node:crypto'

interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  language_code?: string
}

export interface TelegramInitData {
  user: TelegramUser
  auth_date: number
  hash: string
  start_param?: string
}

export async function validateTelegramInitData(initDataRaw: string): TelegramInitData | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    console.error('TELEGRAM_BOT_TOKEN is not set')
    return null
  }

  try {
    const params = new URLSearchParams(initDataRaw)
    const hash = params.get('hash')
    if (!hash) {
      return null
    }

    params.delete('hash')

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')

    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
    const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

    if (expectedHash !== hash) {
      return null
    }

    const authDate = Number(params.get('auth_date'))
    const ageSeconds = Math.floor(Date.now() / 1000) - authDate
    if (ageSeconds > 86400) {
      return null
    }

    const userRaw = params.get('user')
    if (!userRaw) {
      return null
    }

    const user = JSON.parse(userRaw) as TelegramUser

    return {
      user,
      auth_date: authDate,
      hash,
      start_param: params.get('start_param') ?? undefined,
    }
  }
  catch {
    return null
  }
}
