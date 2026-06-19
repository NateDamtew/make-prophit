import { describe, expect, it } from 'vitest'
import { toBaseUnits } from '@/lib/ton/units'

describe('toBaseUnits', () => {
  it('converts whole and fractional amounts at 6 decimals', () => {
    expect(toBaseUnits('10', 6)).toBe(10_000_000n)
    expect(toBaseUnits('10.5', 6)).toBe(10_500_000n)
    expect(toBaseUnits('0.000001', 6)).toBe(1n)
    expect(toBaseUnits('0', 6)).toBe(0n)
  })

  it('truncates excess precision (never rounds up)', () => {
    expect(toBaseUnits('10.1234567', 6)).toBe(10_123_456n)
  })

  it('rejects invalid input', () => {
    expect(() => toBaseUnits('', 6)).toThrow()
    expect(() => toBaseUnits('abc', 6)).toThrow()
    expect(() => toBaseUnits('1,5', 6)).toThrow()
    expect(() => toBaseUnits('-1', 6)).toThrow()
  })
})
