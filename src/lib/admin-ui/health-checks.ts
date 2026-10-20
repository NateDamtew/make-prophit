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
  } catch {
    checks.push({ name: 'Database', state: 'down', detail: 'Unreachable' })
  }

  checks.push(envCheck('Auth secret', 'BETTER_AUTH_SECRET', true))
  checks.push(envCheck('Relayer', 'RELAYER_URL', true))
  checks.push(envCheck('CLOB', 'CLOB_URL', true))
  checks.push(envCheck('Platform keys', 'KUEST_API_KEY', false))
  checks.push(envCheck('Email (Resend)', 'RESEND_API_KEY', false))
  checks.push(envCheck('Dynamic auth', 'NEXT_PUBLIC_DYNAMIC_ENV_ID', true))
  checks.push(envCheck('WalletConnect RPC (EIP-1271 fallback)', 'REOWN_APPKIT_PROJECT_ID', false))
  checks.push(envCheck('Telegram bot', 'TELEGRAM_BOT_TOKEN', false))

  // Mobile money rail (fork-only). A missing token is "not configured", a
  // configured token that cannot reach pawaPay is "down".
  if (process.env.PAWAPAY_API_TOKEN?.trim()) {
    try {
      const { getPawaPayClient } = await import('@/lib/pawapay/client')
      const start = Date.now()
      const client = getPawaPayClient()
      const [config, keys] = await Promise.all([
        client.getActiveConfiguration({ forceRefresh: true }),
        client.getPublicKeys(true),
      ])
      const env = process.env.PAWAPAY_ENV?.trim().toLowerCase() === 'production' ? 'production' : 'sandbox'
      checks.push({
        name: 'pawaPay API',
        state: 'ok',
        detail: `${env} · ${config.countries.length} countries · ${keys.length} callback key(s) · ${Date.now() - start}ms`,
      })
      checks.push({
        name: 'pawaPay signed callbacks',
        state: config.signatureConfiguration?.signedCallbacks ? 'ok' : 'warn',
        detail: config.signatureConfiguration?.signedCallbacks
          ? 'Enabled in dashboard'
          : 'Not enabled in the pawaPay dashboard',
      })
    } catch (error) {
      checks.push({
        name: 'pawaPay API',
        state: 'down',
        detail: error instanceof Error ? error.message : 'Unreachable',
      })
    }
  } else {
    checks.push(envCheck('pawaPay API', 'PAWAPAY_API_TOKEN', false))
  }
  try {
    const { FxRateRepository } = await import('@/lib/fx/rates')
    const { FX_STALE_AFTER_MS } = await import('@/lib/fx/rules')
    const [latest] = await FxRateRepository.latestFeedSnapshots('KES', 1)
    if (!latest) {
      checks.push({ name: 'FX reference rate', state: 'warn', detail: 'No snapshots yet (run /api/sync/fx-rates)' })
    } else {
      const ageMs = Date.now() - latest.fetched_at.getTime()
      checks.push({
        name: 'FX reference rate',
        state: ageMs > FX_STALE_AFTER_MS ? 'warn' : 'ok',
        detail: `${latest.currency} ${Number(latest.rate_per_usd).toFixed(2)}/USD from ${latest.source}, ${Math.round(ageMs / 60_000)} min ago`,
      })
    }
  } catch {
    checks.push({ name: 'FX reference rate', state: 'warn', detail: 'Could not read snapshots' })
  }
  try {
    const { ReconciliationRepository } = await import('@/lib/ledger/reconciliation')
    const latest = await ReconciliationRepository.latestRunAt()
    if (!latest) {
      checks.push({
        name: 'Ledger reconciliation',
        state: 'warn',
        detail: 'Never run (schedule /api/sync/reconcile nightly)',
      })
    } else {
      const ageHours = (Date.now() - latest.getTime()) / 3_600_000
      checks.push({
        name: 'Ledger reconciliation',
        state: ageHours > 36 ? 'warn' : 'ok',
        detail: `Last run ${Math.round(ageHours)}h ago`,
      })
    }
  } catch {
    checks.push({ name: 'Ledger reconciliation', state: 'warn', detail: 'Could not read runs' })
  }

  return {
    checkedAt: new Date().toISOString(),
    deploy: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      env: process.env.VERCEL_ENV ?? null,
    },
    checks,
  }
}
