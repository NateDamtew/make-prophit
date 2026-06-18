'use server'

import type { CreateTonDepositResult, TonDepositQuoteResult } from '@/app/[locale]/(platform)/_actions/ton-deposit.types'
import { UserRepository } from '@/lib/db/queries/user'
import { getDepositWalletAddress } from '@/lib/deposit-wallet'
import { commitQuote, getPublicQuote, getRhinoConfig, getUserQuote, RhinoApiError } from '@/lib/rhino/client'
import { RHINO_CHAIN, RHINO_TOKEN, TON_DEPOSIT_ROUTE } from '@/lib/rhino/constants'
import { resolveJettonWalletAddress } from '@/lib/ton/jetton-wallet'
import { toBaseUnits } from '@/lib/ton/units'

/** USDT on TON has 6 decimals. */
const TON_USDT_DECIMALS = 6

const DEFAULT_QUOTE_ERROR = 'Could not get a TON deposit quote. Please try again.'

/**
 * Indicative quote for displaying rate/fees before the user commits. Public —
 * no recipient binding, no commitment created.
 */
export async function getTonDepositQuoteAction(amount: string): Promise<TonDepositQuoteResult> {
  try {
    const quote = await getPublicQuote({ ...TON_DEPOSIT_ROUTE, amount, mode: 'pay' })
    return { error: null, quote }
  }
  catch (error) {
    if (error instanceof RhinoApiError) {
      console.warn('[ton-deposit] public quote failed', error.status, error.body)
    }
    return { error: DEFAULT_QUOTE_ERROR, quote: null }
  }
}

/**
 * Locks a TON→Polygon deposit for the signed-in user: produces a committed
 * quote bound to their deposit wallet (recipient) and returns everything the
 * client needs to build and send the TON jetton transfer.
 */
export async function createTonDepositAction(
  amount: string,
  depositorTonAddress: string,
): Promise<CreateTonDepositResult> {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user?.address) {
    return { error: 'You must be signed in.', payment: null }
  }
  if (!depositorTonAddress) {
    return { error: 'Connect a TON wallet first.', payment: null }
  }

  try {
    // Deterministic — funds can land here even before the contract is deployed.
    const recipient = user.deposit_wallet_address
      ?? await getDepositWalletAddress(user.address as `0x${string}`)

    const quote = await getUserQuote({
      ...TON_DEPOSIT_ROUTE,
      amount,
      mode: 'pay',
      depositor: depositorTonAddress,
      recipient,
    })

    const config = await getRhinoConfig()
    const tonChain = config[RHINO_CHAIN.ton]
    const jettonMaster = tonChain?.tokens?.[RHINO_TOKEN.usdt]?.address
    if (!tonChain?.contractAddress || !jettonMaster) {
      return { error: DEFAULT_QUOTE_ERROR, payment: null }
    }

    // Resolve everything the client needs to build + send the jetton transfer
    // server-side, so the client only signs. Resolve the jetton wallet BEFORE
    // committing — if the chain lookup fails we haven't locked a commitment.
    const senderJettonWallet = await resolveJettonWalletAddress({
      jettonMaster,
      owner: depositorTonAddress,
    })

    await commitQuote(quote.quoteId)

    return {
      error: null,
      payment: {
        quoteId: quote.quoteId,
        payAmount: quote.payAmount,
        receiveAmount: quote.receiveAmount,
        estimatedDurationMs: quote.estimatedDuration ?? null,
        bridgeContract: tonChain.contractAddress,
        senderJettonWallet,
        jettonAmountBaseUnits: toBaseUnits(quote.payAmount, TON_USDT_DECIMALS).toString(),
        recipient,
      },
    }
  }
  catch (error) {
    if (error instanceof RhinoApiError) {
      console.warn('[ton-deposit] create deposit failed', error.status, error.body)
    }
    else {
      console.error('[ton-deposit] create deposit error', error)
    }
    return { error: DEFAULT_QUOTE_ERROR, payment: null }
  }
}
