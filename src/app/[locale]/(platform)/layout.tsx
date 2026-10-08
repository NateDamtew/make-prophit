import type { ReactNode } from 'react'

import { getExtracted, setRequestLocale } from 'next-intl/server'

import { PlatformLayoutFooter } from '@/app/[locale]/(platform)/(home)/_components/PlatformFooter'
import AffiliateQueryHandler from '@/app/[locale]/(platform)/_components/AffiliateQueryHandler'
import Header from '@/app/[locale]/(platform)/_components/Header'
import MobileBottomNav from '@/app/[locale]/(platform)/_components/MobileBottomNav'
import NavigationTabs from '@/app/[locale]/(platform)/_components/NavigationTabs'
import PlatformViewerState from '@/app/[locale]/(platform)/_components/PlatformViewerState'
import TmaAutoLogin from '@/app/[locale]/(platform)/_components/TmaAutoLogin'
import { FilterProvider } from '@/app/[locale]/(platform)/_providers/FilterProvider'
import PlatformNavigationProvider from '@/app/[locale]/(platform)/_providers/PlatformNavigationProvider'
import { QuickViewProvider } from '@/app/[locale]/(platform)/_providers/QuickViewProvider'
import { TradingOnboardingProvider } from '@/app/[locale]/(platform)/_providers/TradingOnboardingProvider'
import { getRootLocale } from '@/i18n/root-locale'
import { loadPlatformMainTags } from '@/lib/platform-main-tags'
import { buildChildParentMap, buildPlatformNavigationTags } from '@/lib/platform-navigation'
import AppKitProvider from '@/providers/AppKitProvider'
import { CommunityFollowsProvider } from '@/providers/CommunityFollowsProvider'
import TradeAlertsProvider from '@/providers/TradeAlertsProvider'

async function loadPlatformLayoutNavigation() {
  'use cache'

  const locale = await getRootLocale()
  const t = await getExtracted({ locale })
  const { data: mainTags, globalChilds } = await loadPlatformMainTags(locale)

  return {
    tags: buildPlatformNavigationTags({
      mainTags: mainTags ?? [],
      globalChilds,
      trendingLabel: t('Trending'),
      newLabel: t('New'),
      communitiesLabel: t('Communities'),
    }),
    childParentMap: buildChildParentMap(mainTags ?? []),
  }
}

async function PlatformLayoutContent({ children }: { children: ReactNode }) {
  const { tags, childParentMap } = await loadPlatformLayoutNavigation()

  return (
    <TradingOnboardingProvider>
      <PlatformViewerState />
      <FilterProvider>
        <PlatformNavigationProvider tags={tags} childParentMap={childParentMap}>
          <QuickViewProvider>
            <div className="min-h-screen">
              <Header />
              <NavigationTabs />
              {children}
            </div>
            <PlatformLayoutFooter />
            <MobileBottomNav />
            <AffiliateQueryHandler />
            <TmaAutoLogin />
          </QuickViewProvider>
        </PlatformNavigationProvider>
      </FilterProvider>
    </TradingOnboardingProvider>
  )
}

export default async function PlatformLayout({ children }: LayoutProps<'/[locale]'>) {
  const resolvedLocale = await getRootLocale()
  setRequestLocale(resolvedLocale)

  // FORK: AppKitProvider is the Dynamic wallet stack and takes no wagmi cookie —
  // Dynamic restores wallet state client-side after hydration.
  return (
    <AppKitProvider>
      <CommunityFollowsProvider>
        <TradeAlertsProvider>
          <PlatformLayoutContent>{children}</PlatformLayoutContent>
        </TradeAlertsProvider>
      </CommunityFollowsProvider>
    </AppKitProvider>
  )
}
