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
