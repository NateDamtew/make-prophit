import { describe, expect, it } from 'bun:test'

import type { MobileMoneySettings } from '@/lib/mobile-money/settings'
import type { PawaPayActiveConfiguration } from '@/lib/pawapay/types'

import {
  decideIntentTransition,
  findCurrencyForCountry,
  resolveProviderOperation,
  validateDepositAmount,
  validatePayoutAmount,
} from '@/lib/mobile-money/rules'
import { parseMobileMoneySettings } from '@/lib/mobile-money/settings'

const settings: MobileMoneySettings = parseMobileMoneySettings({ mobile_money: { enabled: { value: 'true' } } }, {})

const activeConfiguration: PawaPayActiveConfiguration = {
  countries: [
    {
      country: 'KEN',
      providers: [
        {
          provider: 'MPESA_KEN',
          displayName: 'MPesa',
          nameDisplayedToCustomer: 'M-Pesa',
          currencies: [
            {
              currency: 'KES',
              operationTypes: [
                {
                  operationType: 'DEPOSIT',
                  minAmount: '10',
                  maxAmount: '150000',
                  decimalsInAmount: 'NONE',
                  status: 'OPERATIONAL',
                },
                {
                  operationType: 'PAYOUT',
                  minAmount: '10',
                  maxAmount: '150000',
                  decimalsInAmount: 'TWO_PLACES',
                  status: 'DELAYED',
                },
              ],
            },
          ],
        },
        {
          provider: 'AIRTEL_KEN',
          currencies: [{ currency: 'KES', operationTypes: [{ operationType: 'DEPOSIT', status: 'CLOSED' }] }],
        },
      ],
    },
    {
      country: 'ETH',
      providers: [
        {
          provider: 'MPESA_ETH',
          currencies: [{ currency: 'ETB', operationTypes: [{ operationType: 'DEPOSIT', status: 'OPERATIONAL' }] }],
        },
      ],
    },
  ],
}

function resolve(
  country: string,
  provider: string,
  operationType: 'DEPOSIT' | 'PAYOUT',
  overrides?: Partial<MobileMoneySettings>,
) {
  return resolveProviderOperation({
    settings: { ...settings, ...overrides },
    activeConfiguration,
    country,
    provider,
    operationType,
  })
}

describe('resolveProviderOperation', () => {
  it('maps a Kenyan M-Pesa number to the KES config with pawaPay limits', () => {
    const result = resolve('KEN', 'MPESA_KEN', 'DEPOSIT')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.currency).toBe('KES')
      expect(result.value.providerDisplayName).toBe('M-Pesa')
      expect(result.value.decimalsInAmount).toBe('NONE')
      expect(result.value.minAmount).toBe('10')
    }
  })

  it('fails closed for disabled rail, unknown country, unknown provider, closed provider and pauses', () => {
    expect(resolve('KEN', 'MPESA_KEN', 'DEPOSIT', { enabled: false })).toEqual({ ok: false, error: 'rail_disabled' })
    expect(resolve('ETH', 'MPESA_ETH', 'DEPOSIT')).toEqual({ ok: false, error: 'country_not_supported' })
    expect(resolve('KEN', 'TKASH_KEN', 'DEPOSIT')).toEqual({ ok: false, error: 'provider_not_supported' })
    expect(resolve('KEN', 'AIRTEL_KEN', 'DEPOSIT')).toEqual({ ok: false, error: 'provider_closed' })
    const paused = parseMobileMoneySettings(
      {
        mobile_money: {
          enabled: { value: 'true' },
          'currency:KES': { value: JSON.stringify({ depositsPaused: true, payoutsPaused: true }) },
        },
      },
      {},
    )
    expect(
      resolveProviderOperation({
        settings: paused,
        activeConfiguration,
        country: 'KEN',
        provider: 'MPESA_KEN',
        operationType: 'DEPOSIT',
      }),
    ).toEqual({
      ok: false,
      error: 'deposits_paused',
    })
    expect(
      resolveProviderOperation({
        settings: paused,
        activeConfiguration,
        country: 'KEN',
        provider: 'MPESA_KEN',
        operationType: 'PAYOUT',
      }),
    ).toEqual({
      ok: false,
      error: 'payouts_paused',
    })
  })

  it('DELAYED providers are still allowed (payouts queue)', () => {
    const result = resolve('KEN', 'MPESA_KEN', 'PAYOUT')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.status).toBe('DELAYED')
    }
  })

  it('findCurrencyForCountry only returns enabled currencies', () => {
    expect(findCurrencyForCountry(settings, 'KEN')?.currency).toBe('KES')
    expect(findCurrencyForCountry(settings, 'ETH')).toBeNull()
  })
})

describe('validateDepositAmount', () => {
  const operation = (() => {
    const result = resolve('KEN', 'MPESA_KEN', 'DEPOSIT')
    if (!result.ok) {
      throw new Error('fixture')
    }
    return result.value
  })()

  it('accepts a whole-shilling amount inside every bound', () => {
    expect(validateDepositAmount({ amountMinor: 100_000n, operation, dailyUsedMinor: 0n })).toEqual({
      ok: true,
      value: 100_000n,
    })
  })

  it('rejects decimals when the provider is NONE, and enforces min/max/daily cap', () => {
    expect(validateDepositAmount({ amountMinor: 100_050n, operation, dailyUsedMinor: 0n })).toEqual({
      ok: false,
      error: 'amount_not_whole_units',
    })
    expect(validateDepositAmount({ amountMinor: 0n, operation, dailyUsedMinor: 0n })).toEqual({
      ok: false,
      error: 'invalid_amount',
    })
    // provider min is 10 KES but our own min is 50 KES
    expect(validateDepositAmount({ amountMinor: 2_000n, operation, dailyUsedMinor: 0n })).toEqual({
      ok: false,
      error: 'below_minimum',
    })
    expect(validateDepositAmount({ amountMinor: 16_000_000n, operation, dailyUsedMinor: 0n })).toEqual({
      ok: false,
      error: 'above_maximum',
    })
    expect(validateDepositAmount({ amountMinor: 5_000_000n, operation, dailyUsedMinor: 26_000_000n })).toEqual({
      ok: false,
      error: 'daily_cap_reached',
    })
  })
})

describe('validatePayoutAmount', () => {
  const operation = (() => {
    const result = resolve('KEN', 'MPESA_KEN', 'PAYOUT')
    if (!result.ok) {
      throw new Error('fixture')
    }
    return result.value
  })()

  it('splits gross into fee and net and keeps cents for TWO_PLACES providers', () => {
    const result = validatePayoutAmount({
      grossMinor: 90_000n,
      availableMinor: 100_000n,
      operation,
      dailyUsedMinor: 0n,
    })
    expect(result).toEqual({ ok: true, value: { grossMinor: 90_000n, feeMinor: 2_500n, netMinor: 87_500n } })
  })

  it('refuses more than available, amounts that do not cover the fee, and daily caps', () => {
    expect(
      validatePayoutAmount({ grossMinor: 100_001n, availableMinor: 100_000n, operation, dailyUsedMinor: 0n }),
    ).toEqual({ ok: false, error: 'above_maximum' })
    expect(
      validatePayoutAmount({ grossMinor: 2_500n, availableMinor: 100_000n, operation, dailyUsedMinor: 0n }),
    ).toEqual({ ok: false, error: 'below_minimum' })
    expect(
      validatePayoutAmount({ grossMinor: 5_000n, availableMinor: 100_000n, operation, dailyUsedMinor: 0n }),
    ).toEqual({ ok: false, error: 'below_minimum' })
    expect(
      validatePayoutAmount({ grossMinor: 50_000n, availableMinor: 100_000n, operation, dailyUsedMinor: 29_990_000n }),
    ).toEqual({ ok: false, error: 'daily_cap_reached' })
  })
})

describe('decideIntentTransition', () => {
  it('moves pending intents on final statuses and keeps them pending otherwise', () => {
    expect(decideIntentTransition({ currentState: 'pending', reportedStatus: 'COMPLETED' })).toEqual({
      action: 'complete',
    })
    expect(
      decideIntentTransition({
        currentState: 'initiated',
        reportedStatus: 'FAILED',
        failureCode: 'INSUFFICIENT_BALANCE',
        failureMessage: 'low',
      }),
    ).toEqual({
      action: 'fail',
      failureCode: 'INSUFFICIENT_BALANCE',
      failureMessage: 'low',
    })
    for (const status of ['ACCEPTED', 'ENQUEUED', 'PROCESSING', 'IN_RECONCILIATION'] as const) {
      expect(decideIntentTransition({ currentState: 'pending', reportedStatus: status })).toEqual({
        action: 'keep_pending',
        providerStatus: status,
      })
    }
  })

  it('never moves a final intent and ignores unknown statuses', () => {
    expect(decideIntentTransition({ currentState: 'completed', reportedStatus: 'FAILED' })).toEqual({
      action: 'ignore',
      reason: 'already completed',
    })
    expect(decideIntentTransition({ currentState: 'failed', reportedStatus: 'COMPLETED' })).toEqual({
      action: 'ignore',
      reason: 'already failed',
    })
    expect(decideIntentTransition({ currentState: 'pending', reportedStatus: 'WHATEVER' })).toEqual({
      action: 'ignore',
      reason: 'unknown status WHATEVER',
    })
  })
})
