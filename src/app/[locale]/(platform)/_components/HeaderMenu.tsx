'use client'

import { GiftIcon, ZapIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import dynamic from 'next/dynamic'

import HeaderDropdownUserMenuGuest from '@/app/[locale]/(platform)/_components/HeaderDropdownUserMenuGuest'
import HeaderNotifications from '@/app/[locale]/(platform)/_components/HeaderNotifications'
import { useQuickView } from '@/app/[locale]/(platform)/_providers/QuickViewProvider'
import { useOptionalTradingOnboarding } from '@/app/[locale]/(platform)/_providers/TradingOnboardingContext'
import HeaderDropdownUserMenuAuth from '@/components/HeaderDropdownUserMenuAuth'
import HeaderPortfolio from '@/components/HeaderPortfolio'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppKit } from '@/hooks/useAppKit'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { useIsMobile } from '@/hooks/useIsMobile'
import { Link } from '@/i18n/navigation'
import { authClient } from '@/lib/auth-client'
import { useUser } from '@/stores/useUser'

const { useSession } = authClient

const HeaderDepositButton = dynamic(() => import('@/app/[locale]/(platform)/_components/HeaderDepositButton'), {
  ssr: false,
})

function HeaderMenuSkeleton() {
  return (
    <div className="flex items-center gap-2" aria-hidden="true" data-testid="header-menu-skeleton">
      <Skeleton className="hidden h-9 w-16 lg:block" />
      <Skeleton className="hidden h-9 w-16 lg:block" />
      <Skeleton className="hidden h-9 w-20 lg:block" />
      <Skeleton className="size-9 rounded-md" />
      <Skeleton className="size-9 rounded-md" />
      <div className="-ml-1 hidden h-5 w-px bg-border md:block" />
      <Skeleton className="h-9 w-20 rounded-md" />
    </div>
  )
}

export default function HeaderMenu() {
  return <HeaderMenuClient />
}

function HeaderMenuClient() {
  const t = useExtracted()
  const { open } = useAppKit()
  const { openQuickView } = useQuickView()
  const { data: session, isPending } = useSession()
  const hasHydrated = useHasHydrated()
  const isMobile = useIsMobile()
  const tradingOnboarding = useOptionalTradingOnboarding()
  const user = useUser()

  const shouldShowSkeleton = !hasHydrated || isPending
  const isAuthenticated = !shouldShowSkeleton && (Boolean(session?.user) || Boolean(user))
  const shouldShowGuestActions = !shouldShowSkeleton && !isAuthenticated
  const startDepositFlow = tradingOnboarding?.startDepositFlow

  return (
    <>
      {/* Flash Trade launcher — available to everyone (guests are gated to
          connect a wallet when they try to confirm a trade). */}
      <Button
        size="headerCompact"
        variant="ghost"
        className="gap-1.5 px-2 text-foreground hover:bg-accent/70"
        data-testid="header-quick-view-button"
        aria-label={t('Flash Trade')}
        onClick={openQuickView}
      >
        <ZapIcon className="size-4 text-primary" />
        <span className="hidden sm:inline">{t('Flash Trade')}</span>
      </Button>

      {shouldShowSkeleton && <HeaderMenuSkeleton />}

      {isAuthenticated && (
        <>
          {!isMobile && <HeaderPortfolio />}
          {!isMobile &&
            (startDepositFlow ? (
              <Button size="headerCompact" onClick={startDepositFlow}>
                {t('Deposit')}
              </Button>
            ) : (
              <HeaderDepositButton />
            ))}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  nativeButton={false}
                  render={<Link href="/settings/rewards" aria-label={t('Rewards')} />}
                >
                  <GiftIcon className="size-[1.35rem]" aria-hidden="true" />
                </Button>
              }
            />
            <TooltipContent>{t('Rewards')}</TooltipContent>
          </Tooltip>
          <HeaderNotifications />
          <div className="-ml-1 hidden h-5 w-px bg-border md:block" aria-hidden="true" />
          <HeaderDropdownUserMenuAuth />
        </>
      )}

      {shouldShowGuestActions && (
        <>
          {/* Wallet (SIWE) auth has no separate sign-up vs log-in — connecting a
              wallet creates the account if new, or logs in if it exists. So a
              single "Get Started" button is all that's needed. */}
          <Button size="headerCompact" data-testid="header-get-started-button" onClick={() => open()}>
            {t('Get Started')}
          </Button>
          {!isMobile && <HeaderDropdownUserMenuGuest />}
        </>
      )}
    </>
  )
}
