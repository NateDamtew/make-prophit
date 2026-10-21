import { describe, expect, it } from 'bun:test'

import {
  checkAmountBounds,
  formatMinorUnitsForDisplay,
  formatMinorUnitsForPawaPay,
  parseAmountToMinorUnits,
  roundDownToProviderDecimals,
  sanitizeMsisdn,
} from '@/lib/pawapay/amounts'

describe('parseAmountToMinorUnits', () => {
  it('parses whole and fractional amounts at 2 decimals', () => {
    expect(parseAmountToMinorUnits('1000')).toBe(100_000n)
    expect(parseAmountToMinorUnits('123.45')).toBe(12_345n)
    expect(parseAmountToMinorUnits('0.5')).toBe(50n)
    expect(parseAmountToMinorUnits('0')).toBe(0n)
  })

  it('truncates beyond 2 decimals (never rounds up)', () => {
    expect(parseAmountToMinorUnits('1.999')).toBe(199n)
  })

  it('rejects invalid input', () => {
    expect(() => parseAmountToMinorUnits('')).toThrow()
    expect(() => parseAmountToMinorUnits('-5')).toThrow()
    expect(() => parseAmountToMinorUnits('1,000')).toThrow()
    expect(() => parseAmountToMinorUnits('abc')).toThrow()
  })
})

describe('formatMinorUnitsForPawaPay', () => {
  it('never emits trailing zeros, matching the pawaPay amount pattern', () => {
    expect(formatMinorUnitsForPawaPay(100_000n)).toBe('1000')
    expect(formatMinorUnitsForPawaPay(123_450n)).toBe('1234.5')
    expect(formatMinorUnitsForPawaPay(12_345n)).toBe('123.45')
    expect(formatMinorUnitsForPawaPay(50n)).toBe('0.5')
    expect(formatMinorUnitsForPawaPay(0n)).toBe('0')
  })

  it('rejects negative amounts', () => {
    expect(() => formatMinorUnitsForPawaPay(-1n)).toThrow()
  })
})

describe('roundDownToProviderDecimals', () => {
  it('floors to whole units for NONE and leaves TWO_PLACES alone', () => {
    expect(roundDownToProviderDecimals(123_499n, 'NONE')).toBe(123_400n)
    expect(roundDownToProviderDecimals(123_499n, 'TWO_PLACES')).toBe(123_499n)
    expect(roundDownToProviderDecimals(123_499n, undefined)).toBe(123_499n)
  })
})

describe('formatMinorUnitsForDisplay', () => {
  it('groups thousands and keeps two decimals', () => {
    expect(formatMinorUnitsForDisplay(123_456n)).toBe('1,234.56')
    expect(formatMinorUnitsForDisplay(100_000_000n)).toBe('1,000,000.00')
    expect(formatMinorUnitsForDisplay(100_000n, { trimWholeNumbers: true })).toBe('1,000')
    expect(formatMinorUnitsForDisplay(-2_500n)).toBe('-25.00')
  })
})

describe('checkAmountBounds', () => {
  it('enforces inclusive min/max from provider strings', () => {
    expect(checkAmountBounds(5_000n, { minAmount: '50', maxAmount: '150000' })).toEqual({ ok: true })
    expect(checkAmountBounds(4_999n, { minAmount: '50' })).toEqual({ ok: false, reason: 'below_minimum' })
    expect(checkAmountBounds(15_000_001n, { maxAmount: '150000' })).toEqual({ ok: false, reason: 'above_maximum' })
    expect(checkAmountBounds(1n, {})).toEqual({ ok: true })
  })
})

describe('sanitizeMsisdn', () => {
  it('strips formatting and requires a country code without leading zero', () => {
    expect(sanitizeMsisdn('+254 703-456 789')).toBe('254703456789')
    expect(sanitizeMsisdn('254703456789')).toBe('254703456789')
    expect(sanitizeMsisdn('0703456789')).toBeNull()
    expect(sanitizeMsisdn('12')).toBeNull()
  })
})
