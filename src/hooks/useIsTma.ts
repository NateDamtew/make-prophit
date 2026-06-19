'use client'

import { useHasHydrated } from '@/hooks/useHasHydrated'
import { isTmaContext } from '@/lib/tma'

/**
 * Reactive Telegram Mini App detection. Returns `false` on the server and during
 * the first client render (TMA context is window-dependent), then the real value
 * after hydration — so it never causes an SSR/CSR mismatch.
 */
export function useIsTma(): boolean {
  const hasHydrated = useHasHydrated()
  return hasHydrated && isTmaContext()
}
