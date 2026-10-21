import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

import type { PaymentIntentRow } from '@/lib/mobile-money/intents'
import type { MobileMoneyRuleError, ResolvedProviderOperation } from '@/lib/mobile-money/rules'
import type { MobileMoneySettings } from '@/lib/mobile-money/settings'
import type { PawaPayClient } from '@/lib/pawapay/client'
import type { PawaPayTransactionRecord } from '@/lib/pawapay/types'

import { payment_intents } from '@/lib/db/schema/ledger/tables'
import { db } from '@/lib/drizzle'
import { LedgerService } from '@/lib/ledger/service'
import { recordConsent } from '@/lib/mobile-money/consent'
import { MobileMoneyAccountRepository, PaymentIntentRepository } from '@/lib/mobile-money/intents'
import { MobileMoneyNotifications } from '@/lib/mobile-money/notifications'
import {
  CONSENT_REQUIRED_MESSAGE,
  decideIntentTransition,
  hasCurrentConsent,
  MOBILE_MONEY_RULE_MESSAGES,
  resolveProviderOperation,
  validateDepositAmount,
} from '@/lib/mobile-money/rules'
import { getMobileMoneySettings } from '@/lib/mobile-money/settings'
import { formatMinorUnitsForPawaPay, parseAmountToMinorUnits, sanitizeMsisdn } from '@/lib/pawapay/amounts'
import { getPawaPayClient, PawaPayApiError } from '@/lib/pawapay/client'
import { describePawaPayFailure } from '@/lib/pawapay/failure-codes'

/**
 * Deposit orchestration: resolve the provider for a phone number, validate the
 * amount, create the intent BEFORE calling pawaPay, then move the intent through
 * its states from callbacks or status checks. Completion credits the ledger
 * exactly once (idempotency key = intent id).
 */

export interface DepositDependencies {
  client?: PawaPayClient
  settings?: MobileMoneySettings
  now?: () => Date
}

export type DepositError = {
  error: string
  code: MobileMoneyRuleError | 'invalid_phone' | 'provider_error' | 'not_found' | 'consent_required'
}

export interface DepositPreview {
  msisdn: string
  provider: string
  providerDisplayName: string
  country: string
  currency: string
  minDepositMinor: string
  maxDepositMinor: string
  wholeUnitsOnly: boolean
  providerStatus: string | null
}

function ruleFailure(code: MobileMoneyRuleError): DepositError {
  return { code, error: MOBILE_MONEY_RULE_MESSAGES[code] }
}

async function resolveDeps(deps: DepositDependencies) {
  const settings = deps.settings ?? (await getMobileMoneySettings())
  const client = deps.client ?? getPawaPayClient()
  return { settings, client }
}

/** Resolve a phone number to a provider and the deposit rules that apply. */
export async function previewDeposit(
  params: { phoneInput: string },
  deps: DepositDependencies = {},
): Promise<{ data: DepositPreview; operation: ResolvedProviderOperation } | DepositError> {
  const { settings, client } = await resolveDeps(deps)
  if (!settings.enabled) {
    return ruleFailure('rail_disabled')
  }
  const msisdn = sanitizeMsisdn(params.phoneInput)
  if (!msisdn) {
    return {
      code: 'invalid_phone',
      error: 'Please enter a valid phone number with the country code, e.g. 2547XXXXXXXX.',
    }
  }
  let prediction
  try {
    prediction = await client.predictProvider(msisdn)
  } catch (error) {
    if (error instanceof PawaPayApiError && error.status === 400) {
      return {
        code: 'invalid_phone',
        error: 'Please enter a valid phone number with the country code, e.g. 2547XXXXXXXX.',
      }
    }
    return { code: 'provider_error', error: 'Could not look up that phone number right now. Please try again.' }
  }
  let activeConfiguration
  try {
    activeConfiguration = await client.getActiveConfiguration({ country: prediction.country })
  } catch {
    return { code: 'provider_error', error: 'Mobile money is temporarily unavailable. Please try again shortly.' }
  }
  const resolved = resolveProviderOperation({
    settings,
    activeConfiguration,
    country: prediction.country,
    provider: prediction.provider,
    operationType: 'DEPOSIT',
  })
  if (!resolved.ok) {
    return ruleFailure(resolved.error)
  }
  const operation = resolved.value
  return {
    operation,
    data: {
      msisdn: prediction.phoneNumber || msisdn,
      provider: operation.provider,
      providerDisplayName: operation.providerDisplayName,
      country: operation.country,
      currency: operation.currency,
      minDepositMinor: operation.config.minDepositMinor.toString(),
      maxDepositMinor: operation.config.maxDepositMinor.toString(),
      wholeUnitsOnly: operation.decimalsInAmount === 'NONE',
      providerStatus: operation.status ?? null,
    },
  }
}

export interface CreateDepositResult {
  intentId: string
  state: PaymentIntentRow['state']
  amountMinor: string
  currency: string
  provider: string
  msisdn: string
  failure?: { code: string | null; message: string }
}

/**
 * Create a deposit: validates, writes the intent (state `initiated`), calls
 * pawaPay, then records ACCEPTED→pending or REJECTED→rejected. A thrown
 * provider error leaves the intent `initiated` for the poller to resolve via
 * NOT_FOUND / FOUND.
 */
export async function createDeposit(
  params: { userId: string; phoneInput: string; amountInput: string; acceptTerms?: boolean },
  deps: DepositDependencies = {},
): Promise<{ data: CreateDepositResult } | DepositError> {
  const preview = await previewDeposit({ phoneInput: params.phoneInput }, deps)
  if ('error' in preview) {
    return preview
  }
  const { operation, data } = preview

  let amountMinor: bigint
  try {
    amountMinor = parseAmountToMinorUnits(params.amountInput)
  } catch {
    return ruleFailure('invalid_amount')
  }
  const dailyUsed = await PaymentIntentRepository.getDailyUsage(params.userId, 'deposit', operation.currency)
  const validated = validateDepositAmount({ amountMinor, operation, dailyUsedMinor: dailyUsed })
  if (!validated.ok) {
    return ruleFailure(validated.error)
  }

  // Lock the user's ledger currency on first deposit and make sure the cash account exists.
  const profile = await LedgerService.ensureUserProfile(params.userId, operation.currency, undefined, operation.country)
  // Age + Terms gate: the first deposit carries the acceptance; later ones skip it.
  if (!hasCurrentConsent(profile)) {
    if (!params.acceptTerms) {
      return { code: 'consent_required', error: CONSENT_REQUIRED_MESSAGE }
    }
    await recordConsent(params.userId)
  }
  await LedgerService.getOrCreateUserCashAccount(params.userId, operation.currency)

  const providerRef = randomUUID()
  const [intent] = await db
    .insert(payment_intents)
    .values({
      user_id: params.userId,
      kind: 'deposit',
      provider_ref: providerRef,
      provider: operation.provider,
      msisdn: data.msisdn,
      country: operation.country,
      currency: operation.currency,
      amount: amountMinor,
      fee: 0n,
      net_amount: amountMinor,
      state: 'initiated',
      customer_message: 'Prophit deposit',
    })
    .returning()
  if (!intent) {
    return { code: 'provider_error', error: 'Could not start the deposit. Please try again.' }
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
    const response = await client.initiateDeposit({
      depositId: providerRef,
      amount: formatMinorUnitsForPawaPay(amountMinor),
      currency: operation.currency,
      payer: { type: 'MMO', accountDetails: { phoneNumber: data.msisdn, provider: operation.provider } },
      clientReferenceId: intent.id,
      customerMessage: 'Prophit deposit',
      metadata: [{ intentId: intent.id }, { userId: params.userId, isPII: true }],
    })

    if (response.status === 'REJECTED') {
      const failure = describePawaPayFailure(response.failureReason?.failureCode)
      await db
        .update(payment_intents)
        .set({
          state: 'rejected',
          provider_status: 'REJECTED',
          failure_code: response.failureReason?.failureCode ?? null,
          failure_message: response.failureReason?.failureMessage ?? null,
          last_raw_status: response as unknown as Record<string, unknown>,
        })
        .where(eq(payment_intents.id, intent.id))
      return {
        data: {
          intentId: intent.id,
          state: 'rejected',
          amountMinor: amountMinor.toString(),
          currency: operation.currency,
          provider: operation.provider,
          msisdn: data.msisdn,
          failure: { code: response.failureReason?.failureCode ?? null, message: failure.message },
        },
      }
    }

    // ACCEPTED or DUPLICATE_IGNORED: wait for the callback / poller.
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
        amountMinor: amountMinor.toString(),
        currency: operation.currency,
        provider: operation.provider,
        msisdn: data.msisdn,
      },
    }
  } catch (error) {
    // Network/5xx: we do not know whether pawaPay received it. Keep `initiated`; the poller decides.
    console.error('[mobile-money] deposit initiation error', { intentId: intent.id, error })
    await db
      .update(payment_intents)
      .set({ provider_status: error instanceof PawaPayApiError ? `ERROR_${error.status}` : 'ERROR' })
      .where(eq(payment_intents.id, intent.id))
    return {
      data: {
        intentId: intent.id,
        state: 'initiated',
        amountMinor: amountMinor.toString(),
        currency: operation.currency,
        provider: operation.provider,
        msisdn: data.msisdn,
      },
    }
  }
}

export interface ApplyStatusResult {
  intentId: string
  previousState: PaymentIntentRow['state']
  state: PaymentIntentRow['state']
  action: 'complete' | 'fail' | 'keep_pending' | 'ignore'
}

/**
 * Apply a pawaPay status record (from a callback or a status check) to a
 * deposit intent. Runs in one transaction with the intent row locked, so a
 * callback and the poller can race safely. Completion posts the ledger
 * transaction with idempotency key `deposit:<intentId>`.
 */
export async function applyDepositStatus(
  intentId: string,
  record: Pick<PawaPayTransactionRecord, 'status' | 'failureReason' | 'providerTransactionId'>,
  source: 'callback' | 'status_check',
): Promise<ApplyStatusResult | null> {
  const outcome = await db.transaction(async (tx) => {
    const intent = await PaymentIntentRepository.lockById(intentId, tx)
    if (!intent || intent.kind !== 'deposit') {
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

    // complete: credit the ledger exactly once.
    const cash = await LedgerService.getOrCreateUserCashAccount(intent.user_id, intent.currency, tx)
    const float = await LedgerService.getOrCreateHouseAccount('float', intent.currency, tx)
    const posted = await LedgerService.postTransaction(
      {
        kind: 'deposit',
        referenceType: 'payment_intent',
        referenceId: intent.id,
        idempotencyKey: `deposit:${intent.id}`,
        description: `Mobile money deposit via ${intent.provider}`,
        metadata: { provider: intent.provider, msisdn: intent.msisdn, providerRef: intent.provider_ref },
        entries: [
          { accountId: float.id, side: 'debit', amount: intent.amount, currency: intent.currency },
          { accountId: cash.id, side: 'credit', amount: intent.amount, currency: intent.currency },
        ],
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
    await MobileMoneyAccountRepository.upsertUsed(
      {
        userId: intent.user_id,
        msisdn: intent.msisdn,
        provider: intent.provider,
        country: intent.country,
        currency: intent.currency,
        verified: true,
      },
      tx,
    )
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
    await MobileMoneyNotifications.depositCompleted({
      userId: outcome.notify.intent.user_id,
      intentId: outcome.intentId,
      amountMinor: outcome.notify.intent.amount,
      currency: outcome.notify.intent.currency,
    })
  } else if (outcome.notify?.kind === 'failed') {
    await MobileMoneyNotifications.depositFailed({
      userId: outcome.notify.intent.user_id,
      intentId: outcome.intentId,
      amountMinor: outcome.notify.intent.amount,
      currency: outcome.notify.intent.currency,
      reason: outcome.notify.reason,
    })
  }
  const { notify: _notify, ...result } = outcome
  return result
}

/**
 * Ask pawaPay for the current status of a deposit and apply it. NOT_FOUND on an
 * intent that is still `initiated` means the request never arrived: mark failed.
 */
export async function refreshDepositStatus(
  intent: PaymentIntentRow,
  deps: DepositDependencies = {},
): Promise<ApplyStatusResult | null> {
  const { client } = await resolveDeps(deps)
  let lookup
  try {
    lookup = await client.getDeposit(intent.provider_ref)
  } catch (error) {
    console.error('[mobile-money] deposit status check failed', { intentId: intent.id, error })
    await db
      .update(payment_intents)
      .set({ status_check_count: intent.status_check_count + 1, last_status_check_at: new Date() })
      .where(eq(payment_intents.id, intent.id))
    return null
  }
  if (lookup.status === 'NOT_FOUND') {
    if (intent.state === 'initiated') {
      return applyDepositStatus(
        intent.id,
        {
          status: 'FAILED',
          failureReason: { failureCode: 'NOT_FOUND', failureMessage: 'pawaPay never received this deposit.' },
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
  return applyDepositStatus(intent.id, lookup.data, 'status_check')
}
