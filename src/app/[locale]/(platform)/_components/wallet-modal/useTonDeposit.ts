'use client'

import type { TonDepositPayment } from '@/app/[locale]/(platform)/_actions/ton-deposit.types'
import type { RhinoPublicQuote } from '@/lib/rhino/types'
import { useCallback, useRef, useState } from 'react'
import { createTonDepositAction, getTonDepositQuoteAction } from '@/app/[locale]/(platform)/_actions/ton-deposit'
import { useAppKit } from '@/hooks/useAppKit'
import { buildRhinoJettonTransfer } from '@/lib/ton/rhino-jetton-transfer'

export type TonDepositStatus = 'idle' | 'preparing' | 'signing' | 'submitted' | 'error'

/**
 * Orchestrates a TON→Polygon deposit on top of the proven primitives:
 *   1. live public quote (display only)
 *   2. commit a user quote bound to the deposit wallet (server)
 *   3. build the jetton transfer + sign/send it via the connected TON wallet
 *
 * Delivery tracking (USDC landing on Polygon) is left to the caller's existing
 * deposit-wallet balance polling — no rhino secret key needed.
 */
export function useTonDeposit() {
  const { tonWalletAddress, connectTonWallet, sendTonTransaction } = useAppKit()
  const [status, setStatus] = useState<TonDepositStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [payment, setPayment] = useState<TonDepositPayment | null>(null)

  // Guards against out-of-order quote responses when the user types quickly.
  const quoteSeqRef = useRef(0)
  const [quote, setQuote] = useState<RhinoPublicQuote | null>(null)
  const [isQuoting, setIsQuoting] = useState(false)

  const refreshQuote = useCallback(async (amount: string) => {
    const seq = ++quoteSeqRef.current
    if (!amount || Number(amount) <= 0) {
      setQuote(null)
      setIsQuoting(false)
      return
    }
    setIsQuoting(true)
    const { quote: next } = await getTonDepositQuoteAction(amount)
    if (seq !== quoteSeqRef.current) {
      return // a newer request superseded this one
    }
    setQuote(next)
    setIsQuoting(false)
  }, [])

  const deposit = useCallback(async (amount: string): Promise<TonDepositPayment | null> => {
    if (!tonWalletAddress) {
      setError('Connect a TON wallet first.')
      setStatus('error')
      return null
    }

    setError(null)
    setStatus('preparing')
    try {
      const { error: createError, payment: created } = await createTonDepositAction(amount, tonWalletAddress)
      if (createError || !created) {
        setError(createError ?? 'Could not prepare the TON deposit.')
        setStatus('error')
        return null
      }

      const message = buildRhinoJettonTransfer({
        jettonWalletAddress: created.senderJettonWallet,
        bridgeContract: created.bridgeContract,
        ownerAddress: tonWalletAddress,
        jettonAmount: BigInt(created.jettonAmountBaseUnits),
        commitmentId: created.quoteId,
      })

      setStatus('signing')
      await sendTonTransaction([message])

      setPayment(created)
      setStatus('submitted')
      return created
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : 'TON deposit failed.')
      setStatus('error')
      return null
    }
  }, [tonWalletAddress, sendTonTransaction])

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
    setPayment(null)
    setQuote(null)
  }, [])

  return {
    tonWalletAddress,
    connectTonWallet,
    status,
    error,
    payment,
    quote,
    isQuoting,
    refreshQuote,
    deposit,
    reset,
  }
}
