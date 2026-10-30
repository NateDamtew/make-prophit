'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useAccount, useConfig } from 'wagmi'

import type { PolymarketAccountSnapshot, PolymarketMarketOrderInput } from '@/lib/polymarket/trading-client'

import {
  placePolymarketMarketOrder,
  preparePolymarketAccount,
  redeemPolymarketMarket,
  withdrawPolymarketFunds,
  withPolymarketClient,
} from '@/lib/polymarket/trading-client'

interface PolymarketTradingConfig {
  tradingEnabled: boolean
  reason: 'disabled' | 'not-tester' | 'unauthenticated' | 'region' | null
  country: string | null
  regionRestricted: boolean
  builderCode: string | null
}

const CONFIG_QUERY_KEY = ['polymarket-trading-config']
const ACCOUNT_QUERY_KEY = 'polymarket-account'

async function fetchTradingConfig(): Promise<PolymarketTradingConfig> {
  const response = await fetch('/api/polymarket/config', { cache: 'no-store' })
  if (!response.ok) {
    return { tradingEnabled: false, reason: 'disabled', country: null, regionRestricted: false, builderCode: null }
  }
  return (await response.json()) as PolymarketTradingConfig
}

/** Polymarket trading for the signed-in user: access, account snapshot and orders. */
export function usePolymarketTrading() {
  const wagmiConfig = useConfig()
  const { address, connector } = useAccount()
  const queryClient = useQueryClient()
  const configQuery = useQuery({ queryKey: CONFIG_QUERY_KEY, queryFn: fetchTradingConfig, staleTime: 60_000 })
  const config = configQuery.data

  const connectorId = connector?.id
  const connectorUid = connector?.uid
  const walletContext = useMemo(
    () => (address ? { wagmiConfig, ownerAddress: address, connectorId, connectorUid } : null),
    [address, connectorId, connectorUid, wagmiConfig],
  )

  const accountQuery = useQuery({
    queryKey: [ACCOUNT_QUERY_KEY, address],
    enabled: false,
    queryFn: async (): Promise<PolymarketAccountSnapshot> => {
      if (!walletContext) {
        throw new Error('Connect your wallet to trade.')
      }
      const snapshot = await withPolymarketClient(walletContext, preparePolymarketAccount)
      // Remember the wallet so the portfolio can show it without a signature.
      await fetch('/api/polymarket/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: snapshot.wallet, signer: walletContext.ownerAddress }),
      }).catch(() => {})
      return snapshot
    },
  })

  const placeOrder = useCallback(
    async (input: Omit<PolymarketMarketOrderInput, 'builderCode'>) => {
      if (!walletContext) {
        throw new Error('Connect your wallet to trade.')
      }
      if (!config?.tradingEnabled || !config.builderCode) {
        throw new Error('Polymarket trading is not open for this account yet.')
      }
      const builderCode = config.builderCode
      const response = await withPolymarketClient(walletContext, async (client) => {
        await preparePolymarketAccount(client)
        return await placePolymarketMarketOrder(client, { ...input, builderCode })
      })
      void queryClient.invalidateQueries({ queryKey: [ACCOUNT_QUERY_KEY, address] })
      return response
    },
    [address, config, queryClient, walletContext],
  )

  const claimWinnings = useCallback(
    async (conditionId: string) => {
      if (!walletContext) {
        throw new Error('Connect your wallet first.')
      }
      const outcome = await withPolymarketClient(walletContext, (client) => redeemPolymarketMarket(client, conditionId))
      void queryClient.invalidateQueries({ queryKey: [ACCOUNT_QUERY_KEY, address] })
      return outcome
    },
    [address, queryClient, walletContext],
  )

  const withdraw = useCallback(
    async (amountUsd: number, recipient: `0x${string}`) => {
      if (!walletContext) {
        throw new Error('Connect your wallet first.')
      }
      if (!config?.builderCode) {
        throw new Error('Polymarket is not configured.')
      }
      const builderCode = config.builderCode
      const outcome = await withPolymarketClient(walletContext, (client) =>
        withdrawPolymarketFunds(client, { amountUsd, recipient, builderCode }),
      )
      void queryClient.invalidateQueries({ queryKey: [ACCOUNT_QUERY_KEY, address] })
      return outcome
    },
    [address, config, queryClient, walletContext],
  )

  return {
    isConfigLoading: configQuery.isLoading,
    tradingEnabled: Boolean(config?.tradingEnabled),
    blockReason: config?.reason ?? null,
    country: config?.country ?? null,
    regionRestricted: Boolean(config?.regionRestricted),
    builderCode: config?.builderCode ?? null,
    isWalletConnected: Boolean(address),
    account: accountQuery.data ?? null,
    isAccountLoading: accountQuery.isFetching,
    accountError: accountQuery.error instanceof Error ? accountQuery.error.message : null,
    loadAccount: accountQuery.refetch,
    placeOrder,
    claimWinnings,
    withdraw,
    ownerAddress: address ?? null,
  }
}
