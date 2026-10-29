'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { DepositSheet } from '@/components/communities/money/DepositSheet'
import { WithdrawSheet } from '@/components/communities/money/WithdrawSheet'
import { useAppKit } from '@/hooks/useAppKit'
import { usePathname, useRouter } from '@/i18n/navigation'

/**
 * Opens the deposit or withdraw sheet from `?sheet=deposit|withdraw` on a
 * community page, so any link on the site can land someone in one of them.
 * Closing drops the param. Signed out, the link opens sign-in instead.
 * `signedIn` comes from the server render, so it is right on the first paint.
 */
export function MoneySheets({ community, signedIn }: { community: { slug: string; name: string }; signedIn: boolean }) {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const { open: openAppKit } = useAppKit()
  const requested = params.get('sheet')
  const sheet = requested === 'deposit' || requested === 'withdraw' ? requested : null
  const [dismissed, setDismissed] = useState<string | null>(null)
  const open = sheet !== null && dismissed !== sheet

  function close() {
    setDismissed(sheet)
    const next = new URLSearchParams(params.toString())
    next.delete('sheet')
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  // Signed out: there is nothing to deposit into yet, so ask for sign-in and drop the param.
  useEffect(() => {
    if (sheet && !signedIn) {
      void openAppKit()
    }
  }, [sheet, signedIn, openAppKit])

  if (!sheet || !signedIn) {
    return null
  }
  return sheet === 'deposit' ? (
    <DepositSheet open={open} onOpenChange={(next) => (next ? null : close())} community={community} />
  ) : (
    <WithdrawSheet open={open} onOpenChange={(next) => (next ? null : close())} community={community} />
  )
}
