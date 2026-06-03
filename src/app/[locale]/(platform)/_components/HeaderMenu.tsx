'use client'

import { useExtracted } from 'next-intl'
import dynamic from 'next/dynamic'
import HeaderDropdownUserMenuGuest from '@/app/[locale]/(platform)/_components/HeaderDropdownUserMenuGuest'
import HeaderNotifications from '@/app/[locale]/(platform)/_components/HeaderNotifications'
import { useOptionalTradingOnboarding } from '@/app/[locale]/(platform)/_providers/TradingOnboardingContext'
import HeaderDropdownUserMenuAuth from '@/components/HeaderDropdownUserMenuAuth'
import HeaderPortfolio from '@/components/HeaderPortfolio'
import { Button } from '@/components/ui/button'
import { useAppKit } from '@/hooks/useAppKit'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { useIsMobile } from '@/hooks/useIsMobile'
import { authClient } from '@/lib/auth-client'
import { useUser } from '@/stores/useUser'

const { useSession } = authClient

const HeaderDepositButton = dynamic(
  () => import('@/app/[locale]/(platform)/_components/HeaderDepositButton'),
  { ssr: false },
)

export default function HeaderMenu() {
  return <HeaderMenuClient />
}

function HeaderMenuClient() {
  const t = useExtracted()
  const { open } = useAppKit()
  const { data: session, isPending: isSessionPending } = useSession()
  const hasHydrated = useHasHydrated()
  const isMobile = useIsMobile()
  const tradingOnboarding = useOptionalTradingOnboarding()
  const user = useUser()

  const isAuthenticated = hasHydrated && (Boolean(session?.user) || Boolean(user))
  const shouldShowGuestActions = hasHydrated && !isAuthenticated && !isSessionPending
  const startDepositFlow = tradingOnboarding?.startDepositFlow

  return (
    <>
      {isAuthenticated && (
        <>
          {!isMobile && <HeaderPortfolio />}
          {!isMobile && (
            startDepositFlow
              ? (
                  <Button size="headerCompact" onClick={startDepositFlow}>
                    {t('Deposit')}
                  </Button>
                )
              : (
                  <HeaderDepositButton />
                )
          )}
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
          <Button
            size="headerCompact"
            data-testid="header-get-started-button"
            onClick={() => open()}
          >
            {t('Get Started')}
          </Button>
          {!isMobile && <HeaderDropdownUserMenuGuest />}
        </>
      )}
    </>
  )
}
