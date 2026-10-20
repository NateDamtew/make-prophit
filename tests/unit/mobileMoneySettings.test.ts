import { describe, expect, it } from 'bun:test'

import { parseCurrencyConfig, parseMobileMoneySettings, serializeCurrencyConfig } from '@/lib/mobile-money/settings'
import { describePawaPayFailure } from '@/lib/pawapay/failure-codes'

describe('parseMobileMoneySettings', () => {
  it('defaults to disabled with KES configured', () => {
    const settings = parseMobileMoneySettings(undefined, {})
    expect(settings.enabled).toBe(false)
    expect(settings.enabledCurrencies).toEqual(['KES'])
    expect(settings.currencies.KES.country).toBe('KEN')
    expect(settings.currencies.KES.marginBps).toBe(150)
    expect(settings.currencies.KES.withdrawalFeeMinor).toBe(2_500n)
    expect(settings.allowUnsignedCallbacks).toBe(false)
  })

  it('reads enabled flag, currency list and per-currency overrides', () => {
    const settings = parseMobileMoneySettings(
      {
        mobile_money: {
          enabled: { value: 'true' },
          enabled_currencies: { value: '["KES","UGX"]' },
          'currency:KES': {
            value: JSON.stringify({ marginBps: 200, withdrawalFeeMinor: '3000', depositsPaused: true }),
          },
          'currency:UGX': { value: JSON.stringify({ country: 'UGA', marginBps: 300 }) },
        },
      },
      { PAWAPAY_ALLOW_UNSIGNED_CALLBACKS: 'true' },
    )
    expect(settings.enabled).toBe(true)
    expect(settings.enabledCurrencies).toEqual(['KES', 'UGX'])
    expect(settings.currencies.KES.marginBps).toBe(200)
    expect(settings.currencies.KES.withdrawalFeeMinor).toBe(3_000n)
    expect(settings.currencies.KES.depositsPaused).toBe(true)
    expect(settings.currencies.UGX.country).toBe('UGA')
    expect(settings.currencies.UGX.marginBps).toBe(300)
    expect(settings.allowUnsignedCallbacks).toBe(true)
  })

  it('ignores malformed JSON and clamps the margin', () => {
    const config = parseCurrencyConfig('KES', '{not json')
    expect(config.marginBps).toBe(150)
    expect(parseCurrencyConfig('KES', JSON.stringify({ marginBps: 99_999 })).marginBps).toBe(5_000)
    expect(parseCurrencyConfig('KES', JSON.stringify({ rateOverridePerUsd: 129.5 })).rateOverridePerUsd).toBe(129.5)
    expect(parseCurrencyConfig('KES', JSON.stringify({ rateOverridePerUsd: 0 })).rateOverridePerUsd).toBeNull()
  })

  it('round-trips through serializeCurrencyConfig', () => {
    const original = parseCurrencyConfig('KES', JSON.stringify({ marginBps: 175, floatTargetMinor: '500000000' }))
    const copy = parseCurrencyConfig('KES', serializeCurrencyConfig(original))
    expect(copy).toEqual(original)
  })
})

describe('describePawaPayFailure', () => {
  it('maps known codes and falls back safely', () => {
    expect(describePawaPayFailure('INSUFFICIENT_BALANCE').userActionable).toBe(true)
    expect(describePawaPayFailure('unknown_error').final).toBe(false)
    expect(describePawaPayFailure('SOMETHING_NEW').final).toBe(true)
    expect(describePawaPayFailure(null).message).toContain('could not be completed')
  })
})
