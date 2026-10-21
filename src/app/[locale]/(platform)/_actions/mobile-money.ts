'use server'

import { headers } from 'next/headers'

import type { PaymentIntentRow } from '@/lib/mobile-money/intents'

import { auth } from '@/lib/auth'
import { UserRepository } from '@/lib/db/queries/user'
import { LedgerService } from '@/lib/ledger/service'
import { issueConfirmationToken, verifyConfirmationToken } from '@/lib/mobile-money/confirmation'
import { createDeposit, previewDeposit, refreshDepositStatus } from '@/lib/mobile-money/deposits'
import { MobileMoneyAccountRepository, PaymentIntentRepository } from '@/lib/mobile-money/intents'
import { createPayout, previewPayout, refreshPayoutStatus } from '@/lib/mobile-money/payouts'
import { hasCurrentConsent } from '@/lib/mobile-money/rules'
import { getMobileMoneySettings } from '@/lib/mobile-money/settings'
import { describePawaPayFailure } from '@/lib/pawapay/failure-codes'

/**
 * Server actions behind the Mobile Money panel. Every action resolves the
 * current session itself; nothing trusts a user id from the client.
 */

const NOT_SIGNED_IN = 'You must be signed in.'
const STATUS_REFRESH_MIN_AGE_MS = 20_000

export interface MobileMoneyIntentView {
  id: string
  kind: 'deposit' | 'payout'
  state: PaymentIntentRow['state']
  providerStatus: string | null
  amountMinor: string
  feeMinor: string
  netMinor: string
  currency: string
  provider: string
  msisdn: string
  failureCode: string | null
  failureMessage: string | null
  createdAt: string
  completedAt: string | null
}

function toIntentView(intent: PaymentIntentRow): MobileMoneyIntentView {
  return {
    id: intent.id,
    kind: intent.kind,
    state: intent.state,
    providerStatus: intent.provider_status,
    amountMinor: intent.amount.toString(),
    feeMinor: intent.fee.toString(),
    netMinor: intent.net_amount.toString(),
    currency: intent.currency,
    provider: intent.provider,
    msisdn: intent.msisdn,
    failureCode: intent.failure_code,
    failureMessage:
      intent.state === 'failed' || intent.state === 'rejected'
        ? describePawaPayFailure(intent.failure_code).message
        : null,
    createdAt: intent.created_at.toISOString(),
    completedAt: intent.completed_at?.toISOString() ?? null,
  }
}

export interface MobileMoneySummary {
  enabled: boolean
  currency: string | null
  balanceMinor: string
  reservedMinor: string
  availableMinor: string
  withdrawalsFrozen: boolean
  /** True until the user has confirmed their age and accepted the current Terms (first deposit / stake). */
  consentRequired: boolean
  savedAccounts: Array<{ msisdn: string; provider: string; currency: string; verified: boolean }>
  recent: MobileMoneyIntentView[]
  limits: {
    withdrawalFeeMinor: string
    minDepositMinor: string
    maxDepositMinor: string
    minPayoutMinor: string
    maxPayoutMinor: string
  } | null
}

export async function getMobileMoneySummaryAction(): Promise<{
  data: MobileMoneySummary | null
  error: string | null
}> {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    return { data: null, error: NOT_SIGNED_IN }
  }
  try {
    const settings = await getMobileMoneySettings()
    const profile = await LedgerService.getUserProfile(user.id)
    const currency = profile?.currency ?? settings.enabledCurrencies[0] ?? null
    const balance = currency ? await LedgerService.getUserBalance(user.id, currency) : null
    const [saved, recent] = await Promise.all([
      MobileMoneyAccountRepository.listForUser(user.id),
      PaymentIntentRepository.listForUser(user.id, { limit: 10 }),
    ])
    const config = currency ? settings.currencies[currency] : undefined
    return {
      data: {
        enabled: settings.enabled,
        currency,
        balanceMinor: (balance?.balance ?? 0n).toString(),
        reservedMinor: (balance?.reserved ?? 0n).toString(),
        availableMinor: (balance?.available ?? 0n).toString(),
        withdrawalsFrozen: profile?.withdrawals_frozen ?? false,
        consentRequired: !hasCurrentConsent(profile),
        savedAccounts: saved.map((row) => ({
          msisdn: row.msisdn,
          provider: row.provider,
          currency: row.currency,
          verified: Boolean(row.verified_at),
        })),
        recent: recent.map(toIntentView),
        limits: config
          ? {
              withdrawalFeeMinor: config.withdrawalFeeMinor.toString(),
              minDepositMinor: config.minDepositMinor.toString(),
              maxDepositMinor: config.maxDepositMinor.toString(),
              minPayoutMinor: config.minPayoutMinor.toString(),
              maxPayoutMinor: config.maxPayoutMinor.toString(),
            }
          : null,
      },
      error: null,
    }
  } catch (error) {
    console.error('[mobile-money] summary failed', error)
    return { data: null, error: 'Could not load your mobile money details right now.' }
  }
}

export async function previewMobileMoneyDepositAction(phoneInput: string) {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    return { data: null, error: NOT_SIGNED_IN }
  }
  try {
    const result = await previewDeposit({ phoneInput })
    if ('error' in result) {
      return { data: null, error: result.error }
    }
    return { data: result.data, error: null }
  } catch (error) {
    console.error('[mobile-money] deposit preview failed', error)
    return { data: null, error: 'Could not check that phone number right now. Please try again.' }
  }
}

export async function createMobileMoneyDepositAction(input: {
  phoneInput: string
  amountInput: string
  acceptTerms?: boolean
}) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { data: null, error: NOT_SIGNED_IN }
  }
  try {
    const result = await createDeposit({
      userId: user.id,
      phoneInput: input.phoneInput,
      amountInput: input.amountInput,
      acceptTerms: input.acceptTerms === true,
    })
    if ('error' in result) {
      return { data: null, error: result.error }
    }
    return { data: result.data, error: null }
  } catch (error) {
    console.error('[mobile-money] create deposit failed', error)
    return { data: null, error: 'Could not start the deposit right now. Please try again.' }
  }
}

export interface MobileMoneyPayoutPreview {
  msisdn: string
  provider: string
  providerDisplayName: string
  currency: string
  grossMinor: string
  feeMinor: string
  netMinor: string
  numberVerified: boolean
  /** Present the exact breakdown back to the server when creating the payout. */
  confirmationToken: string
  /** True when the account has TOTP enabled: a current code is required to withdraw. */
  requiresTwoFactor: boolean
}

export async function previewMobileMoneyPayoutAction(input: {
  phoneInput: string
  amountInput: string
}): Promise<{ data: MobileMoneyPayoutPreview | null; error: string | null }> {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    return { data: null, error: NOT_SIGNED_IN }
  }
  try {
    const result = await previewPayout({
      userId: user.id,
      phoneInput: input.phoneInput,
      amountInput: input.amountInput,
    })
    if ('error' in result) {
      return { data: null, error: result.error }
    }
    const confirmationToken = issueConfirmationToken({
      userId: user.id,
      msisdn: result.data.msisdn,
      grossMinor: result.data.grossMinor,
      currency: result.data.currency,
    })
    return {
      data: { ...result.data, confirmationToken, requiresTwoFactor: Boolean(user.twoFactorEnabled) },
      error: null,
    }
  } catch (error) {
    console.error('[mobile-money] payout preview failed', error)
    return { data: null, error: 'Could not prepare the withdrawal right now. Please try again.' }
  }
}

/**
 * Create a payout. Requires the confirmation token from the preview (so the
 * user confirmed this exact number and amount within 5 minutes) and, when the
 * account has 2FA enabled, a current TOTP code verified through better-auth.
 */
export async function createMobileMoneyPayoutAction(input: {
  phoneInput: string
  amountInput: string
  confirmationToken: string
  totpCode?: string
  acceptTerms?: boolean
}) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { data: null, error: NOT_SIGNED_IN }
  }
  try {
    const quote = await previewPayout({ userId: user.id, phoneInput: input.phoneInput, amountInput: input.amountInput })
    if ('error' in quote) {
      return { data: null, error: quote.error }
    }
    const check = verifyConfirmationToken(input.confirmationToken ?? '', {
      userId: user.id,
      msisdn: quote.data.msisdn,
      grossMinor: quote.data.grossMinor,
      currency: quote.data.currency,
    })
    if (!check.ok) {
      return {
        data: null,
        error:
          check.reason === 'expired'
            ? 'That confirmation has expired. Please review the amount and confirm again.'
            : 'Please review the withdrawal details and confirm again.',
      }
    }
    if (user.twoFactorEnabled) {
      const code = (input.totpCode ?? '').replace(/\s+/g, '')
      if (!/^\d{6}$/.test(code)) {
        return { data: null, error: 'Enter the 6-digit code from your authenticator app.' }
      }
      try {
        const verified = await auth.api.verifyTOTP({ body: { code }, headers: await headers() })
        if (!verified || (verified as { status?: boolean }).status === false) {
          return { data: null, error: 'That authenticator code is not valid.' }
        }
      } catch {
        return { data: null, error: 'That authenticator code is not valid.' }
      }
    }
    const result = await createPayout({
      userId: user.id,
      phoneInput: input.phoneInput,
      amountInput: input.amountInput,
      acceptTerms: input.acceptTerms === true,
    })
    if ('error' in result) {
      return { data: null, error: result.error }
    }
    return { data: result.data, error: null }
  } catch (error) {
    console.error('[mobile-money] create payout failed', error)
    return { data: null, error: 'Could not start the withdrawal right now. Please try again.' }
  }
}

/**
 * Current state of one of the caller's intents. While pending and not checked
 * in the last 20s, asks pawaPay directly so the UI resolves even if the
 * callback is slow or not configured in sandbox.
 */
export async function getMobileMoneyIntentAction(
  intentId: string,
): Promise<{ data: MobileMoneyIntentView | null; error: string | null }> {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    return { data: null, error: NOT_SIGNED_IN }
  }
  try {
    let intent = await PaymentIntentRepository.getById(intentId)
    if (!intent || intent.user_id !== user.id) {
      return { data: null, error: 'Payment not found.' }
    }
    const isOpen = intent.state === 'initiated' || intent.state === 'pending'
    const lastCheck = intent.last_status_check_at?.getTime() ?? 0
    if (isOpen && Date.now() - lastCheck > STATUS_REFRESH_MIN_AGE_MS) {
      if (intent.kind === 'deposit') {
        await refreshDepositStatus(intent)
      } else {
        await refreshPayoutStatus(intent)
      }
      intent = (await PaymentIntentRepository.getById(intentId)) ?? intent
    }
    return { data: toIntentView(intent), error: null }
  } catch (error) {
    console.error('[mobile-money] intent lookup failed', error)
    return { data: null, error: 'Could not load the payment status right now.' }
  }
}
