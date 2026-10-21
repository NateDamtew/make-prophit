'use client'

import { useQuery } from '@tanstack/react-query'

import { getLedgerUserStatusAction } from '@/app/[locale]/(platform)/_actions/mobile-money'
import { useUser } from '@/stores/useUser'

/**
 * Is the signed-in user a local-currency (ledger) user? A ledger profile is
 * created at the first mobile-money deposit or seed and locks the currency, so
 * `currency` being set means the account trades in that currency and not in
 * USDC. Fork-only; used to route such users away from the on-chain order flow.
 */
export function useLedgerUser() {
  const user = useUser()
  const query = useQuery({
    queryKey: ['ledger-user', user?.id ?? null],
    queryFn: async () => (await getLedgerUserStatusAction()).data,
    enabled: Boolean(user?.id),
    staleTime: 60_000,
    retry: 1,
  })
  return {
    currency: query.data?.currency ?? null,
    isLedgerUser: Boolean(query.data?.currency),
    isLoading: Boolean(user?.id) && query.isLoading,
  }
}
