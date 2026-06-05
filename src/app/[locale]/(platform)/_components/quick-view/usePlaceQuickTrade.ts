'use client'

import type { Outcome } from '@/types'
import { useCallback } from 'react'
import { useSignTypedData } from 'wagmi'
import { useTradingOnboarding } from '@/app/[locale]/(platform)/_providers/TradingOnboardingContext'
import { useAffiliateOrderMetadata } from '@/hooks/useAffiliateOrderMetadata'
import { useSignaturePromptRunner } from '@/hooks/useSignaturePromptRunner'
import { addressToBuilderCode } from '@/lib/builder-code'
import { getExchangeEip712Domain, ORDER_SIDE, ORDER_TYPE } from '@/lib/constants'
import { buildOrderPayload, submitOrder } from '@/lib/orders'
import { signOrderPayload } from '@/lib/orders/signing'
import { isTradingAuthRequiredError } from '@/lib/trading-auth/errors'
import { isUserRejectedRequestError, normalizeAddress } from '@/lib/wallet'
import { useUser } from '@/stores/useUser'

export interface QuickTradeInput {
  /** CLOB token id of the side being bought (YES or NO). */
  tokenId: string
  conditionId: string
  /** Event slug — required by the CLOB submit call. */
  eventSlug: string
  /** Outcome index of the side (0 = YES/Up, 1 = NO/Down). */
  outcomeIndex: number
  /** Displayed buy price for the side, in cents (0–100). */
  priceCents: number
  /** USD amount to spend. */
  amountUsd: number
  /** Whether this market uses the neg-risk exchange (selects the EIP-712 domain). */
  negRisk: boolean
}

export type QuickTradeResult
  /** Order accepted by the CLOB. */
  = | { status: 'success' }
  /**
       Trading isn't set up (deposit wallet / approvals / trading auth) — the
      onboarding flow has been opened; the caller should leave the trade staged.
   */
    | { status: 'not-ready' }
  /** The user dismissed the signature prompt. */
    | { status: 'cancelled' }
  /** Anything else — show the message. */
    | { status: 'error', message: string }

/**
 * Places a single MARKET BUY through the exact same pipeline the event-page
 * order panel uses: build → sign (deposit-wallet / POLY_1271, via the global
 * signature-prompt host) → submit to the CLOB. Market orders default to FAK on
 * the server, so partial fills are fine and the user never spends more than
 * their stake.
 *
 * This is the real-money path for Flash Trade — no preview/mock.
 */
export function usePlaceQuickTrade() {
  const user = useUser()
  const { signTypedDataAsync } = useSignTypedData()
  const { runWithSignaturePrompt } = useSignaturePromptRunner()
  const { ensureTradingReady, openTradeRequirements } = useTradingOnboarding()
  const affiliateMetadata = useAffiliateOrderMetadata()

  return useCallback(async (input: QuickTradeInput): Promise<QuickTradeResult> => {
    // 1. Gate: deposit wallet deployed + approvals + trading auth. If not ready,
    //    this opens the onboarding flow and returns false.
    if (!ensureTradingReady()) {
      return { status: 'not-ready' }
    }

    const hasDeployedDepositWallet = Boolean(
      user?.deposit_wallet_address && user?.deposit_wallet_status === 'deployed',
    )
    const makerAddress = hasDeployedDepositWallet
      ? normalizeAddress(user!.deposit_wallet_address!)
      : null
    if (!makerAddress) {
      openTradeRequirements()
      return { status: 'not-ready' }
    }

    if (!input.tokenId) {
      return { status: 'error', message: 'This market can’t be traded from Flash Trade.' }
    }

    // buildOrderPayload only reads outcome.token_id; the rest are filled for type
    // completeness.
    const outcome: Outcome = {
      condition_id: input.conditionId,
      outcome_text: '',
      outcome_index: input.outcomeIndex,
      token_id: input.tokenId,
      is_winning_outcome: false,
      created_at: '',
      updated_at: '',
    }

    const payload = buildOrderPayload({
      makerAddress,
      outcome,
      side: ORDER_SIDE.BUY,
      orderType: ORDER_TYPE.MARKET,
      amount: String(input.amountUsd),
      limitPrice: '',
      limitShares: '',
      marketPriceCents: input.priceCents,
      builder: addressToBuilderCode(affiliateMetadata.referrerAddress),
    })

    // 2. Sign — deposit-wallet ERC-1271 via the global signature prompt host.
    let signature: string
    try {
      signature = await runWithSignaturePrompt(() => signOrderPayload({
        payload,
        domain: getExchangeEip712Domain(input.negRisk),
        signTypedDataAsync,
      }))
    }
    catch (error) {
      if (isUserRejectedRequestError(error)) {
        return { status: 'cancelled' }
      }
      return { status: 'error', message: 'We couldn’t sign your order. Please try again.' }
    }

    // 3. Submit to the CLOB.
    try {
      const result = await submitOrder({
        order: payload,
        signature,
        orderType: ORDER_TYPE.MARKET,
        conditionId: input.conditionId,
        slug: input.eventSlug,
      })

      if (result?.error) {
        if (isTradingAuthRequiredError(result.error)) {
          openTradeRequirements({ forceTradingAuth: true })
          return { status: 'not-ready' }
        }
        return { status: 'error', message: result.error }
      }

      return { status: 'success' }
    }
    catch {
      return { status: 'error', message: 'Your order could not be placed. Please try again.' }
    }
  }, [
    user,
    signTypedDataAsync,
    runWithSignaturePrompt,
    ensureTradingReady,
    openTradeRequirements,
    affiliateMetadata.referrerAddress,
  ])
}
