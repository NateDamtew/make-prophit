import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

import type { PaymentIntentRow } from '@/lib/mobile-money/intents'
import type { MobileMoneyRuleError, ResolvedProviderOperation } from '@/lib/mobile-money/rules'
import type { MobileMoneySettings } from '@/lib/mobile-money/settings'
import type { PawaPayClient } from '@/lib/pawapay/client'
import type { PawaPayTransactionRecord } from '@/lib/pawapay/types'

import { payment_intents } from '@/lib/db/schema/ledger/tables'
import { db } from '@/lib/drizzle'
import { LedgerError, LedgerService } from '@/lib/ledger/service'
import { recordConsent } from '@/lib/mobile-money/consent'
import { MobileMoneyAccountRepository, PaymentIntentRepository } from '@/lib/mobile-money/intents'
import { MobileMoneyNotifications } from '@/lib/mobile-money/notifications'
import {
  CONSENT_REQUIRED_MESSAGE,
  decideIntentTransition,
  hasCurrentConsent,
  MOBILE_MONEY_RULE_MESSAGES,
  resolveProviderOperation,
  validatePayoutAmount,
} from '@/lib/mobile-money/rules'
import { getMobileMoneySettings } from '@/lib/mobile-money/settings'
import { formatMinorUnitsForPawaPay, parseAmountToMinorUnits, sanitizeMsisdn } from '@/lib/pawapay/amounts'
import { getPawaPayClient, PawaPayApiError } from '@/lib/pawapay/client'
import { describePawaPayFailure } from '@/lib/pawapay/failure-codes'

/**
 * Payout (withdrawal) orchestration. Money is RESERVED on the user's account
 * when the payout is created and only debited when pawaPay confirms
 * COMPLETED; a FAILED/REJECTED/NOT_FOUND outcome releases the hold.
 *
 * Ledger on completion (one transaction, idempotency key `payout:<intentId>`):
 *   debit  user_cash   gross
 *   credit float       net
 *   credit fees        fee
 */

export interface PayoutDependencies {
  client?: PawaPayClient
  settings?: MobileMoneySettings
}

export type PayoutError = {
  error: string
  code:
    | MobileMoneyRuleError
    | 'invalid_phone'
    | 'provider_error'
    | 'frozen'
    | 'insufficient_funds'
    | 'no_profile'
    | 'consent_required'
}

export interface CreatePayoutResult {
  intentId: string
  state: PaymentIntentRow['state']
  grossMinor: string
  feeMinor: string
  netMinor: string
  currency: string
  provider: string
  msisdn: string
  failure?: { code: string | null; message: string }
}

function ruleFailure(code: MobileMoneyRuleError): PayoutError {
  return { code, error: MOBILE_MONEY_RULE_MESSAGES[code] }
}

async function resolveDeps(deps: PayoutDependencies) {
  const settings = deps.settings ?? (await getMobileMoneySettings())
  const client = deps.client ?? getPawaPayClient()
  return { settings, client }
}

/** Quote a payout without creating anything: fee, net, and the provider that will receive it. */
export async function previewPayout(
  params: { userId: string; phoneInput: string; amountInput: string },
  deps: PayoutDependencies = {},
): Promise<
  | {
      data: {
        msisdn: string
        provider: string
        providerDisplayName: string
        currency: string
        grossMinor: string
        feeMinor: string
        netMinor: string
        numberVerified: boolean
      }
      operation: ResolvedProviderOperation
    }
  | PayoutError
> {
  const { settings, client } = await resolveDeps(deps)
  const profile = await LedgerService.getUserProfile(params.userId)
  if (!profile) {
    return { code: 'no_profile', error: 'Make a deposit first to set up your account currency.' }
  }
  if (profile.withdrawals_frozen) {
    return { code: 'frozen', error: 'Withdrawals are temporarily unavailable on your account. Please contact support.' }
  }
  const resolved = await resolveOperationForPhone({
    settings,
    client,
    phoneInput: params.phoneInput,
    operationType: 'PAYOUT',
  })
  if ('error' in resolved) {
    return resolved
  }
  if (resolved.operation.currency !== profile.currency) {
    return { code: 'currency_disabled', error: `Withdrawals must go to a ${profile.currency} mobile money account.` }
  }
  let grossMinor: bigint
  try {
    grossMinor = parseAmountToMinorUnits(params.amountInput)
  } catch {
    return ruleFailure('invalid_amount')
  }
  const balance = await LedgerService.getUserBalance(params.userId, profile.currency)
  const dailyUsed = await PaymentIntentRepository.getDailyUsage(params.userId, 'payout', profile.currency)
  const savedNumbers = await MobileMoneyAccountRepository.listForUser(params.userId)
  const isVerifiedNumber = savedNumbers.some(
    (row) => row.msisdn === resolved.msisdn && row.provider === resolved.operation.provider && Boolean(row.verified_at),
  )
  const validated = validatePayoutAmount({
    grossMinor,
    availableMinor: balance.available,
    operation: resolved.operation,
    dailyUsedMinor: dailyUsed,
    isVerifiedNumber,
  })
  if (!validated.ok) {
    if (validated.error === 'above_maximum' && grossMinor > balance.available) {
      return { code: 'insufficient_funds', error: 'That is more than your available balance.' }
    }
    return ruleFailure(validated.error)
  }
  return {
    operation: resolved.operation,
    data: {
      msisdn: resolved.msisdn,
      provider: resolved.operation.provider,
      providerDisplayName: resolved.operation.providerDisplayName,
      currency: resolved.operation.currency,
      grossMinor: validated.value.grossMinor.toString(),
      feeMinor: validated.value.feeMinor.toString(),
      netMinor: validated.value.netMinor.toString(),
      numberVerified: isVerifiedNumber,
    },
  }
}

async function resolveOperationForPhone(params: {
  settings: MobileMoneySettings
  client: PawaPayClient
  phoneInput: string
  operationType: 'DEPOSIT' | 'PAYOUT'
}) {
  const msisdn = sanitizeMsisdn(params.phoneInput)
  if (!msisdn) {
    return {
      code: 'invalid_phone',
      error: 'Please enter a valid phone number with the country code.',
    } satisfies PayoutError
  }
  let prediction
  try {
    prediction = await params.client.predictProvider(msisdn)
  } catch (error) {
    if (error instanceof PawaPayApiError && error.status === 400) {
      return {
        code: 'invalid_phone',
        error: 'Please enter a valid phone number with the country code.',
      } satisfies PayoutError
    }
    return {
      code: 'provider_error',
      error: 'Could not look up that phone number right now. Please try again.',
    } satisfies PayoutError
  }
  let activeConfiguration
  try {
    activeConfiguration = await params.client.getActiveConfiguration({ country: prediction.country })
  } catch {
    return {
      code: 'provider_error',
      error: 'Mobile money is temporarily unavailable. Please try again shortly.',
    } satisfies PayoutError
  }
  const resolved = resolveProviderOperation({
    settings: params.settings,
    activeConfiguration,
    country: prediction.country,
    provider: prediction.provider,
    operationType: params.operationType,
  })
  if (!resolved.ok) {
    return ruleFailure(resolved.error)
  }
  return { operation: resolved.value, msisdn: prediction.phoneNumber || msisdn }
}

/**
 * Create a payout: quote → reserve gross on the user's account → write the
 * intent → POST to pawaPay → pending / rejected (hold released on rejection).
 */
export async function createPayout(
  params: { userId: string; phoneInput: string; amountInput: string; acceptTerms?: boolean },
  deps: PayoutDependencies = {},
): Promise<{ data: CreatePayoutResult } | PayoutError> {
  const preview = await previewPayout(params, deps)
  if ('error' in preview) {
    return preview
  }
  const { operation, data } = preview

  // Age + Terms gate (seeded or migrated balances may never have deposited).
  const profile = await LedgerService.getUserProfile(params.userId)
  if (!hasCurrentConsent(profile)) {
    if (!params.acceptTerms) {
      return { code: 'consent_required', error: CONSENT_REQUIRED_MESSAGE }
    }
    await recordConsent(params.userId)
  }
  const grossMinor = BigInt(data.grossMinor)
  const feeMinor = BigInt(data.feeMinor)
  const netMinor = BigInt(data.netMinor)
  const providerRef = randomUUID()

  let intent: PaymentIntentRow
  try {
    intent = await db.transaction(async (tx) => {
      const cash = await LedgerService.getOrCreateUserCashAccount(params.userId, operation.currency, tx)
      const [row] = await tx
        .insert(payment_intents)
        .values({
          user_id: params.userId,
          kind: 'payout',
          provider_ref: providerRef,
          provider: operation.provider,
          msisdn: data.msisdn,
          country: operation.country,
          currency: operation.currency,
          amount: grossMinor,
          fee: feeMinor,
          net_amount: netMinor,
          state: 'initiated',
          customer_message: 'Prophit payout',
        })
        .returning()
      const reservation = await LedgerService.reserve(
        { accountId: cash.id, amount: grossMinor, referenceType: 'payment_intent', referenceId: row!.id },
        tx,
      )
      const [updated] = await tx
        .update(payment_intents)
        .set({ reservation_id: reservation.id })
        .where(eq(payment_intents.id, row!.id))
        .returning()
      return updated!
    })
  } catch (error) {
    if (error instanceof LedgerError && error.code === 'insufficient_funds') {
      return { code: 'insufficient_funds', error: 'That is more than your available balance.' }
    }
    throw error
  }

  await MobileMoneyAccountRepository.upsertUsed({
    userId: params.userId,
    msisdn: data.msisdn,
    provider: operation.provider,
    country: operation.country,
    currency: operation.currency,
  })

  const { client } = await resolveDeps(deps)
  try {
    const response = await client.initiatePayout({
      payoutId: providerRef,
      amount: formatMinorUnitsForPawaPay(netMinor),
      currency: operation.currency,
      recipient: { type: 'MMO', accountDetails: { phoneNumber: data.msisdn, provider: operation.provider } },
      clientReferenceId: intent.id,
      customerMessage: 'Prophit payout',
      metadata: [{ intentId: intent.id }, { userId: params.userId, isPII: true }],
    })
    if (response.status === 'REJECTED') {
      const failure = describePawaPayFailure(response.failureReason?.failureCode)
      await db.transaction(async (tx) => {
        if (intent.reservation_id) {
          await LedgerService.releaseReservation(intent.reservation_id, tx)
        }
        await tx
          .update(payment_intents)
          .set({
            state: 'rejected',
            provider_status: 'REJECTED',
            failure_code: response.failureReason?.failureCode ?? null,
            failure_message: response.failureReason?.failureMessage ?? null,
            last_raw_status: response as unknown as Record<string, unknown>,
            completed_at: new Date(),
          })
          .where(eq(payment_intents.id, intent.id))
      })
      return {
        data: {
          intentId: intent.id,
          state: 'rejected',
          grossMinor: data.grossMinor,
          feeMinor: data.feeMinor,
          netMinor: data.netMinor,
          currency: operation.currency,
          provider: operation.provider,
          msisdn: data.msisdn,
          failure: { code: response.failureReason?.failureCode ?? null, message: failure.message },
        },
      }
    }
    await db
      .update(payment_intents)
      .set({
        state: 'pending',
        provider_status: response.status,
        last_raw_status: response as unknown as Record<string, unknown>,
      })
      .where(eq(payment_intents.id, intent.id))
    return {
      data: {
        intentId: intent.id,
        state: 'pending',
        grossMinor: data.grossMinor,
        feeMinor: data.feeMinor,
        netMinor: data.netMinor,
        currency: operation.currency,
        provider: operation.provider,
        msisdn: data.msisdn,
      },
    }
  } catch (error) {
    console.error('[mobile-money] payout initiation error', { intentId: intent.id, error })
    await db
      .update(payment_intents)
      .set({ provider_status: error instanceof PawaPayApiError ? `ERROR_${error.status}` : 'ERROR' })
      .where(eq(payment_intents.id, intent.id))
    return {
      data: {
        intentId: intent.id,
        state: 'initiated',
        grossMinor: data.grossMinor,
        feeMinor: data.feeMinor,
        netMinor: data.netMinor,
        currency: operation.currency,
        provider: operation.provider,
        msisdn: data.msisdn,
      },
    }
  }
}

export interface ApplyPayoutStatusResult {
  intentId: string
  previousState: PaymentIntentRow['state']
  state: PaymentIntentRow['state']
  action: 'complete' | 'fail' | 'keep_pending' | 'ignore'
}

/** Apply a pawaPay status to a payout intent. COMPLETED debits; FAILED releases the hold. */
export async function applyPayoutStatus(
  intentId: string,
  record: Pick<PawaPayTransactionRecord, 'status' | 'failureReason' | 'providerTransactionId'>,
  source: 'callback' | 'status_check',
): Promise<ApplyPayoutStatusResult | null> {
  const outcome = await db.transaction(async (tx) => {
    const intent = await PaymentIntentRepository.lockById(intentId, tx)
    if (!intent || intent.kind !== 'payout') {
      return null
    }
    const transition = decideIntentTransition({
      currentState: intent.state,
      reportedStatus: record.status,
      failureCode: record.failureReason?.failureCode ?? null,
      failureMessage: record.failureReason?.failureMessage ?? null,
    })
    const touch = {
      last_raw_status: record as unknown as Record<string, unknown>,
      ...(source === 'callback'
        ? { callback_count: intent.callback_count + 1 }
        : { status_check_count: intent.status_check_count + 1, last_status_check_at: new Date() }),
      ...(record.providerTransactionId ? { provider_transaction_id: record.providerTransactionId } : {}),
    }

    if (transition.action === 'ignore') {
      await tx.update(payment_intents).set(touch).where(eq(payment_intents.id, intent.id))
      return {
        intentId: intent.id,
        previousState: intent.state,
        state: intent.state,
        action: 'ignore' as const,
        notify: null,
      }
    }
    if (transition.action === 'keep_pending') {
      await tx
        .update(payment_intents)
        .set({ ...touch, state: 'pending', provider_status: transition.providerStatus })
        .where(eq(payment_intents.id, intent.id))
      return {
        intentId: intent.id,
        previousState: intent.state,
        state: 'pending' as const,
        action: 'keep_pending' as const,
        notify: null,
      }
    }
    if (transition.action === 'fail') {
      if (intent.reservation_id) {
        await LedgerService.releaseReservation(intent.reservation_id, tx)
      }
      const failure = describePawaPayFailure(transition.failureCode)
      await tx
        .update(payment_intents)
        .set({
          ...touch,
          state: 'failed',
          provider_status: 'FAILED',
          failure_code: transition.failureCode,
          failure_message: transition.failureMessage,
          completed_at: new Date(),
        })
        .where(eq(payment_intents.id, intent.id))
      return {
        intentId: intent.id,
        previousState: intent.state,
        state: 'failed' as const,
        action: 'fail' as const,
        notify: { kind: 'failed' as const, intent, reason: failure.message },
      }
    }

    const cash = await LedgerService.getOrCreateUserCashAccount(intent.user_id, intent.currency, tx)
    const float = await LedgerService.getOrCreateHouseAccount('float', intent.currency, tx)
    const fees = await LedgerService.getOrCreateHouseAccount('fees', intent.currency, tx)
    const entries = [
      { accountId: cash.id, side: 'debit' as const, amount: intent.amount, currency: intent.currency },
      { accountId: float.id, side: 'credit' as const, amount: intent.net_amount, currency: intent.currency },
    ]
    if (intent.fee > 0n) {
      entries.push({ accountId: fees.id, side: 'credit' as const, amount: intent.fee, currency: intent.currency })
    }
    const posted = await LedgerService.postTransaction(
      {
        kind: 'payout',
        referenceType: 'payment_intent',
        referenceId: intent.id,
        idempotencyKey: `payout:${intent.id}`,
        description: `Mobile money withdrawal via ${intent.provider}`,
        metadata: { provider: intent.provider, msisdn: intent.msisdn, providerRef: intent.provider_ref },
        entries,
        consumeReservations: intent.reservation_id ? [{ reservationId: intent.reservation_id }] : [],
        // The hold was taken when the payout was created; if an admin released it meanwhile, still settle.
        allowNegativeUserBalance: !intent.reservation_id,
      },
      tx,
    )
    await tx
      .update(payment_intents)
      .set({
        ...touch,
        state: 'completed',
        provider_status: 'COMPLETED',
        ledger_transaction_id: posted.transactionId,
        completed_at: new Date(),
      })
      .where(eq(payment_intents.id, intent.id))
    return {
      intentId: intent.id,
      previousState: intent.state,
      state: 'completed' as const,
      action: 'complete' as const,
      notify: { kind: 'completed' as const, intent },
    }
  })

  if (!outcome) {
    return null
  }
  if (outcome.notify?.kind === 'completed') {
    await MobileMoneyNotifications.payoutCompleted({
      userId: outcome.notify.intent.user_id,
      intentId: outcome.intentId,
      netMinor: outcome.notify.intent.net_amount,
      currency: outcome.notify.intent.currency,
    })
  } else if (outcome.notify?.kind === 'failed') {
    await MobileMoneyNotifications.payoutFailed({
      userId: outcome.notify.intent.user_id,
      intentId: outcome.intentId,
      grossMinor: outcome.notify.intent.amount,
      currency: outcome.notify.intent.currency,
      reason: outcome.notify.reason,
    })
  }
  const { notify: _notify, ...result } = outcome
  return result
}

/** Re-check a payout with pawaPay. NOT_FOUND on an `initiated` intent releases the hold. */
export async function refreshPayoutStatus(
  intent: PaymentIntentRow,
  deps: PayoutDependencies = {},
): Promise<ApplyPayoutStatusResult | null> {
  const { client } = await resolveDeps(deps)
  let lookup
  try {
    lookup = await client.getPayout(intent.provider_ref)
  } catch (error) {
    console.error('[mobile-money] payout status check failed', { intentId: intent.id, error })
    await db
      .update(payment_intents)
      .set({ status_check_count: intent.status_check_count + 1, last_status_check_at: new Date() })
      .where(eq(payment_intents.id, intent.id))
    return null
  }
  if (lookup.status === 'NOT_FOUND') {
    if (intent.state === 'initiated') {
      return applyPayoutStatus(
        intent.id,
        {
          status: 'FAILED',
          failureReason: { failureCode: 'NOT_FOUND', failureMessage: 'pawaPay never received this payout.' },
        },
        'status_check',
      )
    }
    await db
      .update(payment_intents)
      .set({ status_check_count: intent.status_check_count + 1, last_status_check_at: new Date() })
      .where(eq(payment_intents.id, intent.id))
    return null
  }
  return applyPayoutStatus(intent.id, lookup.data, 'status_check')
}
