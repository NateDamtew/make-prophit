import type { MobileMoneyCurrencyConfig, MobileMoneySettings } from '@/lib/mobile-money/settings'
import type { PawaPayDecimalsInAmount, PawaPayProviderStatus, PawaPayTransactionStatus } from '@/lib/pawapay/constants'
import type { PawaPayActiveConfiguration, PawaPayOperationConfiguration } from '@/lib/pawapay/types'

import { checkAmountBounds, roundDownToProviderDecimals } from '@/lib/pawapay/amounts'

/**
 * Pure decision logic for the mobile-money rail: which provider/currency a
 * phone maps to, whether an amount is allowed, and how a pawaPay status moves
 * a payment intent. No database, no network — everything here is unit-tested.
 */

export type MobileMoneyRuleError =
  | 'rail_disabled'
  | 'currency_disabled'
  | 'country_not_supported'
  | 'provider_not_supported'
  | 'provider_closed'
  | 'deposits_paused'
  | 'payouts_paused'
  | 'below_minimum'
  | 'above_maximum'
  | 'daily_cap_reached'
  | 'amount_not_whole_units'
  | 'invalid_amount'

export const MOBILE_MONEY_RULE_MESSAGES: Record<MobileMoneyRuleError, string> = {
  rail_disabled: 'Mobile money is not available right now.',
  currency_disabled: 'This currency is not enabled yet.',
  country_not_supported: 'Mobile money is not available for that phone number’s country yet.',
  provider_not_supported: 'That mobile money provider is not supported yet.',
  provider_closed: 'Your mobile money provider is temporarily unavailable. Please try again later.',
  deposits_paused: 'Deposits are paused for maintenance. Please try again soon.',
  payouts_paused: 'Withdrawals are paused for maintenance. Please try again soon.',
  below_minimum: 'That amount is below the minimum.',
  above_maximum: 'That amount is above the maximum.',
  daily_cap_reached: 'You have reached your daily limit. Please try again tomorrow.',
  amount_not_whole_units: 'Please enter a whole-number amount for this provider.',
  invalid_amount: 'Please enter a valid amount.',
}

export interface ResolvedProviderOperation {
  provider: string
  providerDisplayName: string
  country: string
  currency: string
  config: MobileMoneyCurrencyConfig
  minAmount?: string
  maxAmount?: string
  decimalsInAmount?: PawaPayDecimalsInAmount
  status?: PawaPayProviderStatus
}

export type RuleResult<T> = { ok: true; value: T } | { ok: false; error: MobileMoneyRuleError }

/** Find the enabled currency whose configured country matches a pawaPay country code. */
export function findCurrencyForCountry(
  settings: MobileMoneySettings,
  country: string,
): MobileMoneyCurrencyConfig | null {
  const code = country.toUpperCase()
  for (const currency of settings.enabledCurrencies) {
    const config = settings.currencies[currency]
    if (config && config.country === code) {
      return config
    }
  }
  return null
}

function findOperation(
  activeConfiguration: PawaPayActiveConfiguration,
  country: string,
  provider: string,
  currency: string,
  operationType: 'DEPOSIT' | 'PAYOUT',
): { operation: PawaPayOperationConfiguration | null; providerDisplayName: string; providerFound: boolean } {
  const countryConfig = activeConfiguration.countries.find((item) => item.country === country)
  const providerConfig = countryConfig?.providers.find((item) => item.provider === provider)
  if (!providerConfig) {
    return { operation: null, providerDisplayName: provider, providerFound: false }
  }
  const currencyConfig = providerConfig.currencies.find((item) => item.currency === currency)
  const operation = currencyConfig?.operationTypes.find((item) => item.operationType === operationType) ?? null
  return {
    operation,
    providerDisplayName: providerConfig.nameDisplayedToCustomer || providerConfig.displayName || provider,
    providerFound: true,
  }
}

/**
 * Combine our settings with pawaPay's live configuration for one provider and
 * operation. Fails closed: unknown country, provider, or a CLOSED provider all
 * refuse.
 */
export function resolveProviderOperation(params: {
  settings: MobileMoneySettings
  activeConfiguration: PawaPayActiveConfiguration
  country: string
  provider: string
  operationType: 'DEPOSIT' | 'PAYOUT'
}): RuleResult<ResolvedProviderOperation> {
  const { settings, activeConfiguration, provider, operationType } = params
  if (!settings.enabled) {
    return { ok: false, error: 'rail_disabled' }
  }
  const country = params.country.toUpperCase()
  const config = findCurrencyForCountry(settings, country)
  if (!config) {
    return { ok: false, error: 'country_not_supported' }
  }
  if (operationType === 'DEPOSIT' && config.depositsPaused) {
    return { ok: false, error: 'deposits_paused' }
  }
  if (operationType === 'PAYOUT' && config.payoutsPaused) {
    return { ok: false, error: 'payouts_paused' }
  }
  const { operation, providerDisplayName, providerFound } = findOperation(
    activeConfiguration,
    country,
    provider,
    config.currency,
    operationType,
  )
  if (!providerFound || !operation) {
    return { ok: false, error: 'provider_not_supported' }
  }
  if (operation.status === 'CLOSED') {
    return { ok: false, error: 'provider_closed' }
  }
  return {
    ok: true,
    value: {
      provider,
      providerDisplayName,
      country,
      currency: config.currency,
      config,
      minAmount: operation.minAmount,
      maxAmount: operation.maxAmount,
      decimalsInAmount: operation.decimalsInAmount,
      status: operation.status,
    },
  }
}

/**
 * Validate a deposit amount (minor units) against provider decimals, provider
 * bounds, our own bounds and the user's rolling daily cap. Returns the amount
 * to send, which equals the input when valid (we never silently round deposits:
 * the user must enter what the provider accepts).
 */
export function validateDepositAmount(params: {
  amountMinor: bigint
  operation: ResolvedProviderOperation
  dailyUsedMinor: bigint
}): RuleResult<bigint> {
  const { amountMinor, operation, dailyUsedMinor } = params
  if (amountMinor <= 0n) {
    return { ok: false, error: 'invalid_amount' }
  }
  if (roundDownToProviderDecimals(amountMinor, operation.decimalsInAmount) !== amountMinor) {
    return { ok: false, error: 'amount_not_whole_units' }
  }
  const providerBounds = checkAmountBounds(amountMinor, {
    minAmount: operation.minAmount,
    maxAmount: operation.maxAmount,
  })
  if (!providerBounds.ok) {
    return { ok: false, error: providerBounds.reason }
  }
  if (amountMinor < operation.config.minDepositMinor) {
    return { ok: false, error: 'below_minimum' }
  }
  if (operation.config.maxDepositMinor > 0n && amountMinor > operation.config.maxDepositMinor) {
    return { ok: false, error: 'above_maximum' }
  }
  if (
    operation.config.dailyDepositCapMinor > 0n &&
    dailyUsedMinor + amountMinor > operation.config.dailyDepositCapMinor
  ) {
    return { ok: false, error: 'daily_cap_reached' }
  }
  return { ok: true, value: amountMinor }
}

/**
 * Validate a payout. Returns gross (debited from the user), fee, and net (sent
 * to the provider, rounded DOWN to the provider's decimals).
 */
export function validatePayoutAmount(params: {
  grossMinor: bigint
  availableMinor: bigint
  operation: ResolvedProviderOperation
  dailyUsedMinor: bigint
}): RuleResult<{ grossMinor: bigint; feeMinor: bigint; netMinor: bigint }> {
  const { grossMinor, availableMinor, operation, dailyUsedMinor } = params
  if (grossMinor <= 0n) {
    return { ok: false, error: 'invalid_amount' }
  }
  const feeMinor = operation.config.withdrawalFeeMinor
  const netUnrounded = grossMinor - feeMinor
  if (netUnrounded <= 0n) {
    return { ok: false, error: 'below_minimum' }
  }
  const netMinor = roundDownToProviderDecimals(netUnrounded, operation.decimalsInAmount)
  if (netMinor <= 0n) {
    return { ok: false, error: 'below_minimum' }
  }
  if (grossMinor > availableMinor) {
    return { ok: false, error: 'above_maximum' }
  }
  const providerBounds = checkAmountBounds(netMinor, { minAmount: operation.minAmount, maxAmount: operation.maxAmount })
  if (!providerBounds.ok) {
    return { ok: false, error: providerBounds.reason }
  }
  if (netMinor < operation.config.minPayoutMinor) {
    return { ok: false, error: 'below_minimum' }
  }
  if (operation.config.maxPayoutMinor > 0n && netMinor > operation.config.maxPayoutMinor) {
    return { ok: false, error: 'above_maximum' }
  }
  if (operation.config.dailyPayoutCapMinor > 0n && dailyUsedMinor + grossMinor > operation.config.dailyPayoutCapMinor) {
    return { ok: false, error: 'daily_cap_reached' }
  }
  return { ok: true, value: { grossMinor, feeMinor, netMinor } }
}

export type IntentTransition =
  | { action: 'complete' }
  | { action: 'fail'; failureCode: string | null; failureMessage: string | null }
  | { action: 'keep_pending'; providerStatus: PawaPayTransactionStatus }
  | { action: 'ignore'; reason: string }

/**
 * Decide what a reported pawaPay status means for an intent in `currentState`.
 * Final states never move again; UNKNOWN_ERROR style failures without a final
 * status are kept pending so the poller re-checks.
 */
export function decideIntentTransition(params: {
  currentState: 'initiated' | 'pending' | 'completed' | 'failed' | 'rejected' | 'cancelled'
  reportedStatus: string | undefined
  failureCode?: string | null
  failureMessage?: string | null
}): IntentTransition {
  const { currentState, reportedStatus } = params
  if (
    currentState === 'completed' ||
    currentState === 'failed' ||
    currentState === 'rejected' ||
    currentState === 'cancelled'
  ) {
    return { action: 'ignore', reason: `already ${currentState}` }
  }
  switch (reportedStatus) {
    case 'COMPLETED':
      return { action: 'complete' }
    case 'FAILED':
      return { action: 'fail', failureCode: params.failureCode ?? null, failureMessage: params.failureMessage ?? null }
    case 'ACCEPTED':
    case 'ENQUEUED':
    case 'PROCESSING':
    case 'IN_RECONCILIATION':
      return { action: 'keep_pending', providerStatus: reportedStatus }
    default:
      return { action: 'ignore', reason: `unknown status ${reportedStatus ?? '(none)'}` }
  }
}
