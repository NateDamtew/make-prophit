'use server'

import type { CreateTonWithdrawalResult, TonWithdrawalQuoteResult } from '@/app/[locale]/(platform)/_actions/ton-withdrawal.types'
import { UserRepository } from '@/lib/db/queries/user'
import { commitQuote, getPublicQuote, getRhinoConfig, getUserQuote, RhinoApiError } from '@/lib/rhino/client'
import { RHINO_CHAIN, RHINO_TOKEN, TON_WITHDRAWAL_ROUTE } from '@/lib/rhino/constants'
import { toBaseUnits } from '@/lib/ton/units'

/** Polygon USDC (our collateral) has 6 decimals. */
const POLYGON_USDC_DECIMALS = 6
const DEFAULT_QUOTE_ERROR = 'Could not get a TON withdrawal quote. Please try again.'

/**
 * Indicative quote for displaying rate/fees before the user commits. Public —
 * no recipient binding, no commitment created.
 */
export async function getTonWithdrawalQuoteAction(amount: string): Promise<TonWithdrawalQuoteResult> {
  try {
    const quote = await getPublicQuote({ ...TON_WITHDRAWAL_ROUTE, amount, mode: 'pay' })
    return { error: null, quote }
  }
  catch (error) {
    if (error instanceof RhinoApiError) {
      console.warn('[ton-withdrawal] public quote failed', error.status, error.body)
    }
    return { error: DEFAULT_QUOTE_ERROR, quote: null }
  }
}

/**
 * Locks a Polygon→TON withdrawal for the signed-in user: produces a committed
 * quote with the deposit wallet as depositor and the user's TON wallet as
 * recipient, and returns everything the client needs to build the on-chain
 * `depositWithId` call (signed by the deposit wallet via the relayer).
 */
export async function createTonWithdrawalAction(
  amount: string,
  recipientTonAddress: string,
): Promise<CreateTonWithdrawalResult> {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user?.address) {
    return { error: 'You must be signed in.', order: null }
  }
  if (!user.deposit_wallet_address) {
    return { error: 'Set up your deposit wallet first.', order: null }
  }
  if (!recipientTonAddress) {
    return { error: 'Connect a TON wallet first.', order: null }
  }

  try {
    const quote = await getUserQuote({
      ...TON_WITHDRAWAL_ROUTE,
      amount,
      mode: 'pay',
      depositor: user.deposit_wallet_address,
      recipient: recipientTonAddress,
    })

    const config = await getRhinoConfig()
    const polygonChain = config[RHINO_CHAIN.polygon]
    const usdcToken = polygonChain?.tokens?.[RHINO_TOKEN.usdc]?.address
    if (!polygonChain?.contractAddress || !usdcToken) {
      return { error: DEFAULT_QUOTE_ERROR, order: null }
    }

    await commitQuote(quote.quoteId)

    return {
      error: null,
      order: {
        quoteId: quote.quoteId,
        payAmount: quote.payAmount,
        receiveAmount: quote.receiveAmount,
        estimatedDurationMs: quote.estimatedDuration ?? null,
        bridgeContract: polygonChain.contractAddress,
        token: usdcToken,
        amountBaseUnits: toBaseUnits(quote.payAmount, POLYGON_USDC_DECIMALS).toString(),
      },
    }
  }
  catch (error) {
    if (error instanceof RhinoApiError) {
      console.warn('[ton-withdrawal] create withdrawal failed', error.status, error.body)
    }
    else {
      console.error('[ton-withdrawal] create withdrawal error', error)
    }
    return { error: DEFAULT_QUOTE_ERROR, order: null }
  }
}
