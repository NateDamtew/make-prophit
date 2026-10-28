'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { MobileMoneyIntentView, MobileMoneySummary } from '@/app/[locale]/(platform)/_actions/mobile-money'

import {
  getMobileMoneyIntentAction,
  getMobileMoneySummaryAction,
} from '@/app/[locale]/(platform)/_actions/mobile-money'
import { useUser } from '@/stores/useUser'

/**
 * React Query hooks over the mobile-money actions, in the style of
 * `usePoolMarketData`: the signed-in user's local-currency balance and saved
 * M-Pesa numbers, and a poller for one deposit / withdrawal while it waits
 * for the phone prompt.
 */

const POLL_MS = 3_000
const SETTLED_STATES = new Set(['completed', 'failed', 'rejected', 'cancelled'])

export function useMobileMoneySummary() {
  const user = useUser()
  return useQuery<MobileMoneySummary | null>({
    queryKey: ['mobile-money', 'summary', user?.id ?? null],
    queryFn: async () => {
      const result = await getMobileMoneySummaryAction()
      return result.data ?? null
    },
    enabled: Boolean(user),
    staleTime: 10_000,
  })
}

export function useMobileMoneyIntent(intentId: string | null) {
  return useQuery<MobileMoneyIntentView | null>({
    queryKey: ['mobile-money', 'intent', intentId],
    queryFn: async () => {
      if (!intentId) {
        return null
      }
      const result = await getMobileMoneyIntentAction(intentId)
      return result.data ?? null
    },
    enabled: Boolean(intentId),
    refetchInterval: (query) => {
      const state = query.state.data?.state
      return state && SETTLED_STATES.has(state) ? false : POLL_MS
    },
  })
}

export function useInvalidateMobileMoney() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['mobile-money'] })
}
