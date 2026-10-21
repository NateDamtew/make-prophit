'use client'

import { UsersIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'

import { MOBILE_BOTTOM_NAV_OFFSET } from '@/app/[locale]/(platform)/_lib/mobile-bottom-nav'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

interface EventOrderPanelLedgerGateProps {
  currency: string
  isMobile: boolean
}

/**
 * Shown to local-currency (ledger) users in place of the on-chain order panel.
 * Their balance lives in the ledger, not in a Kuest deposit wallet, so the
 * USDC order flow cannot spend it. Main markets in local currency arrive with
 * the house-trading phase; until then the community pools are where that
 * balance trades. Fork-only component.
 */
export default function EventOrderPanelLedgerGate({ currency, isMobile }: EventOrderPanelLedgerGateProps) {
  const t = useExtracted()

  const body = (
    <>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <UsersIcon className="size-4 text-primary" />
        {t('Trade this in your communities')}
      </div>
      <p className="text-sm text-muted-foreground">
        {t(
          'Your {currency} balance works on community markets. Trading the main markets in {currency} is coming soon.',
          {
            currency,
          },
        )}
      </p>
      <Button nativeButton={false} className="h-11 w-full font-semibold" render={<Link href="/communities" />}>
        {t('Browse communities')}
      </Button>
    </>
  )

  if (isMobile) {
    return (
      <div
        className="fixed inset-x-0 z-30 grid gap-2 border-t bg-background p-4 lg:hidden"
        style={{ bottom: MOBILE_BOTTOM_NAV_OFFSET }}
      >
        {body}
      </div>
    )
  }

  return <div className={cn('grid gap-3 rounded-xl border bg-card p-4 lg:w-85')}>{body}</div>
}
