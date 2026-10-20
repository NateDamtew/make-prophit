import { formatMinorUnitsForDisplay } from '@/lib/pawapay/amounts'

/**
 * Display helpers for pool amounts. Pools are denominated in the community's
 * local currency (minor units, two decimals), and users never see USD, so
 * every label here is "<amount> <CCY>" with no dollar sign anywhere.
 */

function toBigInt(value: bigint | string | number | null | undefined): bigint {
  if (value === null || value === undefined) {
    return 0n
  }
  if (typeof value === 'bigint') {
    return value
  }
  if (typeof value === 'number') {
    return BigInt(Math.trunc(value))
  }
  try {
    return BigInt(value)
  } catch {
    return 0n
  }
}

/** "1,250 KES" (whole amounts drop the cents; "1,250.50 KES" otherwise). */
export function formatPoolMoney(
  minor: bigint | string | number | null | undefined,
  currency: string | null | undefined,
) {
  const body = formatMinorUnitsForDisplay(toBigInt(minor), { trimWholeNumbers: true })
  return currency ? `${body} ${currency}` : body
}

/** Compact amount for cards and meta strips: "12.5k KES", "1.2M KES", "500 KES". */
export function formatPoolVolume(
  minor: bigint | string | number | null | undefined,
  currency: string | null | undefined,
) {
  const whole = Number(toBigInt(minor) / 100n)
  let body: string
  if (!Number.isFinite(whole) || whole < 0) {
    body = '0'
  } else if (whole >= 1_000_000) {
    body = `${(whole / 1_000_000).toFixed(1)}M`
  } else if (whole >= 1_000) {
    body = `${(whole / 1_000).toFixed(whole >= 10_000 ? 0 : 1)}k`
  } else {
    body = whole.toFixed(0)
  }
  return currency ? `${body} ${currency}` : body
}

/** Minor units → plain number of major units (for inputs and arithmetic in the UI). */
export function minorToMajorNumber(minor: bigint | string | number | null | undefined): number {
  const value = toBigInt(minor)
  return Number(value) / 100
}

/** Major-unit string typed by the user → minor units (floors to cents; invalid → null). */
export function majorInputToMinor(input: string): bigint | null {
  const cleaned = input.replace(/,/g, '').trim()
  if (!cleaned || !/^\d+(\.\d{0,2})?$/.test(cleaned)) {
    return null
  }
  const [whole, frac = ''] = cleaned.split('.')
  return BigInt(whole) * 100n + BigInt(`${frac}00`.slice(0, 2))
}
