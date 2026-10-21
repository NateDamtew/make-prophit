import type { PawaPayDecimalsInAmount } from './constants'

import { PAWAPAY_AMOUNT_PATTERN, PAWAPAY_MSISDN_PATTERN } from './constants'

/**
 * The ledger keeps every currency at two decimals (integer minor units). pawaPay
 * accepts at most the provider's `decimalsInAmount`, so the provider edge rounds
 * DOWN and formats without trailing zeros (their pattern rejects "15.00").
 */
const LEDGER_DECIMALS = 2
const LEDGER_SCALE = 10n ** BigInt(LEDGER_DECIMALS)

class PawaPayAmountError extends Error {}

/** "123.45" → 12345n. Truncates beyond 2 decimals. Rejects anything that is not a plain decimal. */
export function parseAmountToMinorUnits(value: string): bigint {
  const trimmed = value.trim()
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new PawaPayAmountError(`Invalid amount: ${value}`)
  }
  const [whole, frac = ''] = trimmed.split('.')
  const fracPadded = `${frac}${'0'.repeat(LEDGER_DECIMALS)}`.slice(0, LEDGER_DECIMALS)
  return BigInt(whole) * LEDGER_SCALE + BigInt(fracPadded || '0')
}

/** 12345n → "123.45"; 12300n → "123" (no trailing zeros, pawaPay style). */
export function formatMinorUnitsForPawaPay(minorUnits: bigint): string {
  if (minorUnits < 0n) {
    throw new PawaPayAmountError('Amount must not be negative.')
  }
  const whole = minorUnits / LEDGER_SCALE
  const frac = (minorUnits % LEDGER_SCALE).toString().padStart(LEDGER_DECIMALS, '0').replace(/0+$/, '')
  const formatted = frac ? `${whole}.${frac}` : `${whole}`
  if (!PAWAPAY_AMOUNT_PATTERN.test(formatted)) {
    throw new PawaPayAmountError(`Amount is not representable for pawaPay: ${formatted}`)
  }
  return formatted
}

/** Round DOWN to what the provider accepts. NONE → whole units; TWO_PLACES → unchanged. */
export function roundDownToProviderDecimals(minorUnits: bigint, decimals: PawaPayDecimalsInAmount | undefined): bigint {
  if (decimals === 'NONE') {
    return (minorUnits / LEDGER_SCALE) * LEDGER_SCALE
  }
  return minorUnits
}

/** Human display for a local-currency amount in minor units, e.g. 123456n → "1,234.56". */
export function formatMinorUnitsForDisplay(minorUnits: bigint, options: { trimWholeNumbers?: boolean } = {}): string {
  const negative = minorUnits < 0n
  const abs = negative ? -minorUnits : minorUnits
  const whole = (abs / LEDGER_SCALE).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const frac = (abs % LEDGER_SCALE).toString().padStart(LEDGER_DECIMALS, '0')
  const body = options.trimWholeNumbers && frac === '00' ? whole : `${whole}.${frac}`
  return negative ? `-${body}` : body
}

export interface AmountBounds {
  minAmount?: string
  maxAmount?: string
}

export type AmountBoundsCheck = { ok: true } | { ok: false; reason: 'below_minimum' | 'above_maximum' }

/** Validate a minor-units amount against the provider's min/max (both inclusive, as decimal strings). */
export function checkAmountBounds(minorUnits: bigint, bounds: AmountBounds): AmountBoundsCheck {
  if (bounds.minAmount && minorUnits < parseAmountToMinorUnits(bounds.minAmount)) {
    return { ok: false, reason: 'below_minimum' }
  }
  if (bounds.maxAmount && minorUnits > parseAmountToMinorUnits(bounds.maxAmount)) {
    return { ok: false, reason: 'above_maximum' }
  }
  return { ok: true }
}

/** Strip "+", spaces and separators; the result must be a plausible MSISDN with country code. */
export function sanitizeMsisdn(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  return PAWAPAY_MSISDN_PATTERN.test(digits) ? digits : null
}
