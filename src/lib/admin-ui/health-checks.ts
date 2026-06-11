import { sql } from 'drizzle-orm'
import { db } from '@/lib/drizzle'

export type HealthState = 'ok' | 'warn' | 'down'

interface HealthCheck {
  name: string
  state: HealthState
  detail: string
}

export interface HealthReport {
  checkedAt: string
  deploy: {
    commit: string | null
    env: string | null
  }
  checks: HealthCheck[]
}

function envCheck(name: string, key: string, required: boolean): HealthCheck {
  const present = !!process.env[key]?.trim()
  if (present) {
    return { name, state: 'ok', detail: 'Configured' }
  }
  return {
    name,
    state: required ? 'down' : 'warn',
    detail: required ? 'Missing (required)' : 'Not configured',
  }
}

export async function runHealthChecks(): Promise<HealthReport> {
  const checks: HealthCheck[] = []

  // Database connectivity.
  try {
    const start = Date.now()
    await db.execute(sql`SELECT 1`)
    checks.push({ name: 'Database', state: 'ok', detail: `Reachable (${Date.now() - start}ms)` })
  }
  catch {
    checks.push({ name: 'Database', state: 'down', detail: 'Unreachable' })
  }

  checks.push(envCheck('Auth secret', 'BETTER_AUTH_SECRET', true))
  checks.push(envCheck('Relayer', 'RELAYER_URL', true))
  checks.push(envCheck('CLOB', 'CLOB_URL', true))
  checks.push(envCheck('Platform keys', 'KUEST_API_KEY', false))
  checks.push(envCheck('Email (Resend)', 'RESEND_API_KEY', false))
  checks.push(envCheck('Reown AppKit', 'REOWN_APPKIT_PROJECT_ID', true))
  checks.push(envCheck('Telegram bot', 'TELEGRAM_BOT_TOKEN', false))

  return {
    checkedAt: new Date().toISOString(),
    deploy: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      env: process.env.VERCEL_ENV ?? null,
    },
    checks,
  }
}
