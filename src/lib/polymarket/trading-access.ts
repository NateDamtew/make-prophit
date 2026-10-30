import { getRequestCountryCode } from '@/lib/geoblock-settings'

/**
 * Who may trade venue = 'polymarket' markets from Prophit.
 *
 * POLYMARKET_TRADING_MODE   off (default) | testers | all
 * POLYMARKET_TRADING_TESTERS comma-separated user ids, emails or wallet addresses
 *
 * Admins count as testers. On top of that, Polymarket's own restricted
 * jurisdictions are refused (it rejects new orders from them anyway).
 */

export type PolymarketTradingMode = 'off' | 'testers' | 'all'

export type PolymarketTradingBlockReason = 'disabled' | 'not-tester' | 'unauthenticated' | 'region'

export interface PolymarketTradingAccess {
  allowed: boolean
  reason: PolymarketTradingBlockReason | null
  country: string | null
  /** Polymarket refuses orders from this country, whatever the trading mode. */
  regionRestricted: boolean
}

/**
 * Countries where Polymarket blocks or limits new orders (docs.polymarket.com
 * geoblock, checked 2026-10-24): OFAC-blocked plus close-only on the API.
 */
const POLYMARKET_RESTRICTED_COUNTRIES = new Set([
  'IR',
  'SY',
  'CU',
  'KP',
  'AU',
  'BY',
  'BE',
  'BI',
  'BR',
  'CF',
  'CD',
  'ET',
  'FR',
  'DE',
  'IQ',
  'IT',
  'LB',
  'LY',
  'MM',
  'NZ',
  'NI',
  'PL',
  'RU',
  'SG',
  'SO',
  'SK',
  'SS',
  'SD',
  'TW',
  'TH',
  'GB',
  'US',
  'UM',
  'VE',
  'YE',
  'ZW',
])

interface TradingUser {
  id: string
  email?: string | null
  address?: string | null
  is_admin?: boolean | null
}

function resolvePolymarketTradingMode(env: Readonly<Partial<NodeJS.ProcessEnv>> = process.env) {
  const mode = env.POLYMARKET_TRADING_MODE?.trim().toLowerCase()
  return mode === 'testers' || mode === 'all' ? mode : 'off'
}

function isListedTester(user: TradingUser, env: Readonly<Partial<NodeJS.ProcessEnv>>) {
  const entries = (env.POLYMARKET_TRADING_TESTERS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  const identities = [user.id, user.email, user.address]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value))
  return identities.some((identity) => entries.includes(identity))
}

function isPolymarketRestrictedCountry(country: string | null) {
  return Boolean(country && POLYMARKET_RESTRICTED_COUNTRIES.has(country.toUpperCase()))
}

export function resolvePolymarketTradingAccess(
  user: TradingUser | null,
  requestHeaders: Headers,
  env: Readonly<Partial<NodeJS.ProcessEnv>> = process.env,
): PolymarketTradingAccess {
  const country = getRequestCountryCode(requestHeaders)
  const regionRestricted = isPolymarketRestrictedCountry(country)
  const mode = resolvePolymarketTradingMode(env)
  if (mode === 'off') {
    return { allowed: false, reason: 'disabled', country, regionRestricted }
  }
  if (!user) {
    return { allowed: false, reason: 'unauthenticated', country, regionRestricted }
  }
  if (mode === 'testers' && !user.is_admin && !isListedTester(user, env)) {
    return { allowed: false, reason: 'not-tester', country, regionRestricted }
  }
  if (regionRestricted) {
    return { allowed: false, reason: 'region', country, regionRestricted }
  }
  return { allowed: true, reason: null, country, regionRestricted }
}

/** The public builder code that attributes orders to Prophit. */
export function getPolymarketBuilderCode(env: Readonly<Partial<NodeJS.ProcessEnv>> = process.env) {
  const code = env.POLYMARKET_BUILDER_CODE?.trim() ?? ''
  return /^0x[0-9a-fA-F]{64}$/.test(code) ? code : null
}
