import { SettingsRepository } from '@/lib/db/queries/settings'
import { PAWAPAY_ENV_VARS } from '@/lib/pawapay/constants'

/**
 * Non-secret configuration for the mobile-money rail, stored in the `settings`
 * table under one group so admins can change it without a deploy. Secrets
 * (the pawaPay token) stay in env — see LOCAL-PAYMENTS-IMPLEMENTATION.md D2/D3.
 *
 * Adding a currency later = add it to `enabled_currencies` and a `currency:<CCY>`
 * row; nothing here hard-codes KES beyond the defaults.
 */

export const MOBILE_MONEY_SETTINGS_GROUP = 'mobile_money'
export const MOBILE_MONEY_ENABLED_KEY = 'enabled'
export const MOBILE_MONEY_ENABLED_CURRENCIES_KEY = 'enabled_currencies'
export const MOBILE_MONEY_CURRENCY_KEY_PREFIX = 'currency:'

export interface MobileMoneyCurrencyConfig {
  currency: string
  /** ISO 3166-1 alpha-3, as pawaPay expects. */
  country: string
  /** Platform margin applied to order-book trades, in basis points (150 = 1.5%). */
  marginBps: number
  /** Flat withdrawal fee in minor units. */
  withdrawalFeeMinor: bigint
  minDepositMinor: bigint
  maxDepositMinor: bigint
  minPayoutMinor: bigint
  maxPayoutMinor: bigint
  /** Per-user rolling 24h caps in minor units; 0 disables the cap. */
  dailyDepositCapMinor: bigint
  dailyPayoutCapMinor: bigint
  /** Treasury targets (minor units); 0 = not set. */
  floatTargetMinor: bigint
  exposureCapMinor: bigint
  /** Pause switches, independent per operation. */
  depositsPaused: boolean
  payoutsPaused: boolean
  tradingPaused: boolean
  /** Admin-set reference rate (local units per 1 USD) that overrides the feed when > 0. */
  rateOverridePerUsd: number | null
}

export interface MobileMoneySettings {
  enabled: boolean
  enabledCurrencies: string[]
  currencies: Record<string, MobileMoneyCurrencyConfig>
  /** Env-driven: whether unsigned pawaPay callbacks are tolerated (sandbox only). */
  allowUnsignedCallbacks: boolean
}

type SettingsMap = Record<string, Record<string, { value: string }>>

export const DEFAULT_CURRENCY_CONFIGS: Record<string, MobileMoneyCurrencyConfig> = {
  KES: {
    currency: 'KES',
    country: 'KEN',
    marginBps: 150,
    withdrawalFeeMinor: 2_500n, // 25.00 KES
    minDepositMinor: 5_000n, // 50 KES
    maxDepositMinor: 15_000_000n, // 150,000 KES (M-Pesa per-transaction ceiling is 250k; stay under)
    minPayoutMinor: 10_000n, // 100 KES
    maxPayoutMinor: 15_000_000n,
    dailyDepositCapMinor: 30_000_000n, // 300,000 KES
    dailyPayoutCapMinor: 30_000_000n,
    floatTargetMinor: 0n,
    exposureCapMinor: 0n,
    depositsPaused: false,
    payoutsPaused: false,
    tradingPaused: false,
    rateOverridePerUsd: null,
  },
}

function readBigint(value: unknown, fallback: bigint): bigint {
  if (typeof value === 'bigint') {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value))
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return BigInt(value.trim())
  }
  return fallback
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  return fallback
}

/** Parse one `currency:<CCY>` JSON value on top of the defaults for that currency. */
export function parseCurrencyConfig(currency: string, raw: string | undefined): MobileMoneyCurrencyConfig {
  const code = currency.toUpperCase()
  const base = DEFAULT_CURRENCY_CONFIGS[code] ?? {
    ...DEFAULT_CURRENCY_CONFIGS.KES,
    currency: code,
    country: '',
  }
  let parsed: Record<string, unknown> = {}
  if (raw) {
    try {
      const value = JSON.parse(raw) as unknown
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        parsed = value as Record<string, unknown>
      }
    } catch {
      parsed = {}
    }
  }
  const override = readNumber(parsed.rateOverridePerUsd, Number.NaN)
  return {
    currency: code,
    country:
      typeof parsed.country === 'string' && parsed.country.trim() ? parsed.country.trim().toUpperCase() : base.country,
    marginBps: Math.max(0, Math.min(5_000, Math.round(readNumber(parsed.marginBps, base.marginBps)))),
    withdrawalFeeMinor: readBigint(parsed.withdrawalFeeMinor, base.withdrawalFeeMinor),
    minDepositMinor: readBigint(parsed.minDepositMinor, base.minDepositMinor),
    maxDepositMinor: readBigint(parsed.maxDepositMinor, base.maxDepositMinor),
    minPayoutMinor: readBigint(parsed.minPayoutMinor, base.minPayoutMinor),
    maxPayoutMinor: readBigint(parsed.maxPayoutMinor, base.maxPayoutMinor),
    dailyDepositCapMinor: readBigint(parsed.dailyDepositCapMinor, base.dailyDepositCapMinor),
    dailyPayoutCapMinor: readBigint(parsed.dailyPayoutCapMinor, base.dailyPayoutCapMinor),
    floatTargetMinor: readBigint(parsed.floatTargetMinor, base.floatTargetMinor),
    exposureCapMinor: readBigint(parsed.exposureCapMinor, base.exposureCapMinor),
    depositsPaused: readBoolean(parsed.depositsPaused, base.depositsPaused),
    payoutsPaused: readBoolean(parsed.payoutsPaused, base.payoutsPaused),
    tradingPaused: readBoolean(parsed.tradingPaused, base.tradingPaused),
    rateOverridePerUsd: Number.isFinite(override) && override > 0 ? override : null,
  }
}

/** Serialize a currency config for storage (bigints as strings). */
export function serializeCurrencyConfig(config: MobileMoneyCurrencyConfig): string {
  return JSON.stringify({
    country: config.country,
    marginBps: config.marginBps,
    withdrawalFeeMinor: config.withdrawalFeeMinor.toString(),
    minDepositMinor: config.minDepositMinor.toString(),
    maxDepositMinor: config.maxDepositMinor.toString(),
    minPayoutMinor: config.minPayoutMinor.toString(),
    maxPayoutMinor: config.maxPayoutMinor.toString(),
    dailyDepositCapMinor: config.dailyDepositCapMinor.toString(),
    dailyPayoutCapMinor: config.dailyPayoutCapMinor.toString(),
    floatTargetMinor: config.floatTargetMinor.toString(),
    exposureCapMinor: config.exposureCapMinor.toString(),
    depositsPaused: config.depositsPaused,
    payoutsPaused: config.payoutsPaused,
    tradingPaused: config.tradingPaused,
    rateOverridePerUsd: config.rateOverridePerUsd,
  })
}

export function parseMobileMoneySettings(
  settings: SettingsMap | undefined,
  env: NodeJS.ProcessEnv = process.env,
): MobileMoneySettings {
  const group = settings?.[MOBILE_MONEY_SETTINGS_GROUP]
  const enabled = group?.[MOBILE_MONEY_ENABLED_KEY]?.value === 'true'

  let enabledCurrencies: string[] = ['KES']
  const rawCurrencies = group?.[MOBILE_MONEY_ENABLED_CURRENCIES_KEY]?.value
  if (rawCurrencies) {
    try {
      const parsed = JSON.parse(rawCurrencies) as unknown
      if (Array.isArray(parsed)) {
        enabledCurrencies = parsed
          .filter((item): item is string => typeof item === 'string' && /^[A-Z]{3}$/i.test(item.trim()))
          .map((item) => item.trim().toUpperCase())
      }
    } catch {
      // keep default
    }
  }

  const currencies: Record<string, MobileMoneyCurrencyConfig> = {}
  for (const currency of enabledCurrencies) {
    currencies[currency] = parseCurrencyConfig(
      currency,
      group?.[`${MOBILE_MONEY_CURRENCY_KEY_PREFIX}${currency}`]?.value,
    )
  }

  return {
    enabled,
    enabledCurrencies,
    currencies,
    allowUnsignedCallbacks: env[PAWAPAY_ENV_VARS.allowUnsignedCallbacks]?.trim().toLowerCase() === 'true',
  }
}

export async function getMobileMoneySettings(): Promise<MobileMoneySettings> {
  const { data, error } = await SettingsRepository.getSettings()
  if (error) {
    throw new Error('Unable to load mobile money settings.')
  }
  return parseMobileMoneySettings(data ?? undefined)
}

export function getCurrencyConfigOrNull(
  settings: MobileMoneySettings,
  currency: string,
): MobileMoneyCurrencyConfig | null {
  return settings.currencies[currency.toUpperCase()] ?? null
}
