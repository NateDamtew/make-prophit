'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useAccount, useConfig } from 'wagmi'

import type { PolymarketAccountSnapshot, PolymarketMarketOrderInput } from '@/lib/polymarket/trading-client'

import {
  placePolymarketMarketOrder,
  preparePolymarketAccount,
  withPolymarketClient,
} from '@/lib/polymarket/trading-client'

interface PolymarketTradingConfig {
  tradingEnabled: boolean
  reason: 'disabled' | 'not-tester' | 'unauthenticated' | 'region' | null
  country: string | null
  builderCode: string | null
}

const CONFIG_QUERY_KEY = ['polymarket-trading-config']
const ACCOUNT_QUERY_KEY = 'polymarket-account'

async function fetchTradingConfig(): Promise<PolymarketTradingConfig> {
  const response = await fetch('/api/polymarket/config', { cache: 'no-store' })
  if (!response.ok) {
    return { tradingEnabled: false, reason: 'disabled', country: null, builderCode: null }
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
      return await withPolymarketClient(walletContext, preparePolymarketAccount)
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

  return {
    isConfigLoading: configQuery.isLoading,
    tradingEnabled: Boolean(config?.tradingEnabled),
    blockReason: config?.reason ?? null,
    builderCode: config?.builderCode ?? null,
    isWalletConnected: Boolean(address),
    account: accountQuery.data ?? null,
    isAccountLoading: accountQuery.isFetching,
    accountError: accountQuery.error instanceof Error ? accountQuery.error.message : null,
    loadAccount: accountQuery.refetch,
    placeOrder,
  }
}
