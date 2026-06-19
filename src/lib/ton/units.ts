/**
 * Converts a decimal amount string (e.g. "10.5") into integer base units for a
 * token with `decimals` precision, without floating-point math. Excess
 * precision is truncated (never rounded up), so we never try to spend more than
 * the user entered.
 */
export function toBaseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim()
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid amount: ${value}`)
  }
  const [whole, frac = ''] = trimmed.split('.')
  const fracPadded = `${frac}${'0'.repeat(decimals)}`.slice(0, decimals)
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || '0')
}
