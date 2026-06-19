'use client'

import type { RhinoPublicQuote } from '@/lib/rhino/types'
import { useCallback, useRef, useState } from 'react'
import { useSignTypedData } from 'wagmi'
import { createTonWithdrawalAction, getTonWithdrawalQuoteAction } from '@/app/[locale]/(platform)/_actions/ton-withdrawal'
import { useAppKit } from '@/hooks/useAppKit'
import { useSignaturePromptRunner } from '@/hooks/useSignaturePromptRunner'
import { isTradingAuthRequiredError } from '@/lib/trading-auth/errors'
import { signAndSubmitDepositWalletCalls } from '@/lib/wallet/client'
import { buildRhinoWithdrawCalls } from '@/lib/wallet/transactions'

export type TonWithdrawalStatus = 'idle' | 'preparing' | 'signing' | 'submitted' | 'error'

interface WithdrawalUser {
  address: string
  deposit_wallet_address?: string | null
}

/**
 * Orchestrates a Polygon→TON withdrawal: live quote → commit a user quote
 * (depositor = deposit wallet, recipient = connected TON wallet) → build the
 * `depositWithId` calls → sign + submit through the existing deposit-wallet
 * relayer flow. The user signs an EIP-712 batch with their EVM signer; no TON
 * signature is involved.
 */
export function useTonWithdrawal(user: WithdrawalUser | null) {
  const { tonWalletAddress, connectTonWallet } = useAppKit()
  const { signTypedDataAsync } = useSignTypedData()
  const { runWithSignaturePrompt } = useSignaturePromptRunner()

  const [status, setStatus] = useState<TonWithdrawalStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [needsTradingAuth, setNeedsTradingAuth] = useState(false)

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
    const { quote: next } = await getTonWithdrawalQuoteAction(amount)
    if (seq !== quoteSeqRef.current) {
      return
    }
    setQuote(next)
    setIsQuoting(false)
  }, [])

  const withdraw = useCallback(async (amount: string): Promise<boolean> => {
    if (!user?.address) {
      setError('You must be signed in.')
      setStatus('error')
      return false
    }
    if (!tonWalletAddress) {
      setError('Connect a TON wallet first.')
      setStatus('error')
      return false
    }

    setError(null)
    setNeedsTradingAuth(false)
    setStatus('preparing')
    try {
      const { error: createError, order } = await createTonWithdrawalAction(amount, tonWalletAddress)
      if (createError || !order) {
        setError(createError ?? 'Could not prepare the TON withdrawal.')
        setStatus('error')
        return false
      }

      const calls = buildRhinoWithdrawCalls({
        token: order.token as `0x${string}`,
        bridgeContract: order.bridgeContract as `0x${string}`,
        amount: BigInt(order.amountBaseUnits),
        commitmentId: order.quoteId,
      })

      setStatus('signing')
      const result = await runWithSignaturePrompt(() => signAndSubmitDepositWalletCalls({
        user,
        calls,
        metadata: 'ton_withdraw',
        signTypedDataAsync,
      }))

      if (result.error) {
        if (isTradingAuthRequiredError(result.error)) {
          setNeedsTradingAuth(true)
        }
        setError(result.error)
        setStatus('error')
        return false
      }

      setStatus('submitted')
      return true
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : 'TON withdrawal failed.')
      setStatus('error')
      return false
    }
  }, [user, tonWalletAddress, runWithSignaturePrompt, signTypedDataAsync])

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
    setNeedsTradingAuth(false)
    setQuote(null)
  }, [])

  return {
    tonWalletAddress,
    connectTonWallet,
    status,
    error,
    needsTradingAuth,
    quote,
    isQuoting,
    refreshQuote,
    withdraw,
    reset,
  }
}
