import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getFinanceActor } from '@/lib/admin-ui/finance-guard'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { SettingsRepository } from '@/lib/db/queries/settings'
import {
  getMobileMoneySettings,
  MOBILE_MONEY_CURRENCY_KEY_PREFIX,
  MOBILE_MONEY_ENABLED_CURRENCIES_KEY,
  MOBILE_MONEY_ENABLED_KEY,
  MOBILE_MONEY_SETTINGS_GROUP,
  parseCurrencyConfig,
  serializeCurrencyConfig,
} from '@/lib/mobile-money/settings'

const minor = z.string().regex(/^\d+$/).optional()

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  enabledCurrencies: z
    .array(z.string().regex(/^[A-Za-z]{3}$/))
    .min(1)
    .optional(),
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .optional(),
  config: z
    .object({
      country: z
        .string()
        .regex(/^[A-Za-z]{3}$/)
        .optional(),
      marginBps: z.number().int().min(0).max(5000).optional(),
      withdrawalFeeMinor: minor,
      minDepositMinor: minor,
      maxDepositMinor: minor,
      minPayoutMinor: minor,
      maxPayoutMinor: minor,
      dailyDepositCapMinor: minor,
      dailyPayoutCapMinor: minor,
      newNumberPayoutCapMinor: minor,
      floatTargetMinor: minor,
      exposureCapMinor: minor,
      depositsPaused: z.boolean().optional(),
      payoutsPaused: z.boolean().optional(),
      tradingPaused: z.boolean().optional(),
      rateOverridePerUsd: z.number().positive().nullable().optional(),
    })
    .optional(),
})

function serializeForClient(settings: Awaited<ReturnType<typeof getMobileMoneySettings>>) {
  return {
    enabled: settings.enabled,
    enabledCurrencies: settings.enabledCurrencies,
    allowUnsignedCallbacks: settings.allowUnsignedCallbacks,
    currencies: Object.fromEntries(
      Object.entries(settings.currencies).map(([code, config]) => [
        code,
        JSON.parse(serializeCurrencyConfig(config)) as Record<string, unknown>,
      ]),
    ),
  }
}

export async function GET() {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const settings = await getMobileMoneySettings()
  return NextResponse.json({ data: serializeForClient(settings) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(request: NextRequest) {
  const actor = await getFinanceActor()
  if (!actor) {
    return NextResponse.json({ error: 'Finance permission required.' }, { status: 403 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 400 })
  }

  const before = await getMobileMoneySettings()
  const updates: Array<{ group: string; key: string; value: string }> = []
  if (parsed.data.enabled !== undefined) {
    updates.push({
      group: MOBILE_MONEY_SETTINGS_GROUP,
      key: MOBILE_MONEY_ENABLED_KEY,
      value: String(parsed.data.enabled),
    })
  }
  if (parsed.data.enabledCurrencies) {
    updates.push({
      group: MOBILE_MONEY_SETTINGS_GROUP,
      key: MOBILE_MONEY_ENABLED_CURRENCIES_KEY,
      value: JSON.stringify([...new Set(parsed.data.enabledCurrencies.map((code) => code.toUpperCase()))]),
    })
  }
  if (parsed.data.currency && parsed.data.config) {
    const code = parsed.data.currency.toUpperCase()
    const current = before.currencies[code] ?? parseCurrencyConfig(code, undefined)
    const merged = parseCurrencyConfig(
      code,
      JSON.stringify({ ...JSON.parse(serializeCurrencyConfig(current)), ...parsed.data.config }),
    )
    updates.push({
      group: MOBILE_MONEY_SETTINGS_GROUP,
      key: `${MOBILE_MONEY_CURRENCY_KEY_PREFIX}${code}`,
      value: serializeCurrencyConfig(merged),
    })
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const result = await SettingsRepository.updateSettings(updates)
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  const after = await getMobileMoneySettings()
  await recordAuditEvent({
    actor,
    action: 'mobile_money.settings_updated',
    targetType: 'settings',
    targetId: MOBILE_MONEY_SETTINGS_GROUP,
    summary: `Updated mobile money settings (${updates.map((u) => u.key).join(', ')})`,
    diff: { before: serializeForClient(before), after: serializeForClient(after) },
  })
  return NextResponse.json({ data: serializeForClient(after) })
}
