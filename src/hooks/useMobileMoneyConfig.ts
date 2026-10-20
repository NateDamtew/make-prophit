'use client'

import { useQuery } from '@tanstack/react-query'

export interface MobileMoneyPublicCurrency {
  currency: string
  country: string
  withdrawalFeeMinor: string
  minDepositMinor: string
  maxDepositMinor: string
  minPayoutMinor: string
  maxPayoutMinor: string
  depositsPaused: boolean
  payoutsPaused: boolean
}

export interface MobileMoneyPublicConfig {
  enabled: boolean
  currencies: MobileMoneyPublicCurrency[]
}

const DISABLED: MobileMoneyPublicConfig = { enabled: false, currencies: [] }

async function fetchConfig(): Promise<MobileMoneyPublicConfig> {
  const response = await fetch('/api/mobile-money/config', { credentials: 'same-origin' })
  if (!response.ok) {
    return DISABLED
  }
  return (await response.json()) as MobileMoneyPublicConfig
}

/** Whether the mobile-money rail is switched on, plus the public limits for the UI. Safe default: off. */
export function useMobileMoneyConfig(enabled = true) {
  const query = useQuery({
    queryKey: ['mobile-money-config'],
    queryFn: fetchConfig,
    enabled,
    staleTime: 60_000,
    retry: 1,
  })
  return { config: query.data ?? DISABLED, isLoading: query.isLoading }
}
