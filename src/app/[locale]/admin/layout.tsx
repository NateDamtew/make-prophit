import type { Metadata } from 'next'

import { setRequestLocale } from 'next-intl/server'
import { cacheTag } from 'next/cache'

import PlatformViewerState from '@/app/[locale]/(platform)/_components/PlatformViewerState'
import AdminHeader from '@/app/[locale]/admin/_components/AdminHeader'
import AdminOnboardingSupportWidget from '@/app/[locale]/admin/_components/AdminOnboardingSupportWidget'
import AdminSidebar from '@/app/[locale]/admin/_components/AdminSidebar'
import CopyVersion from '@/app/[locale]/admin/_components/CopyVersion'
import { AdminCommandProvider } from '@/components/admin-ui/CommandPalette'
import { AdminSidebarProvider } from '@/components/admin-ui/shell/SidebarProvider'
import {
  getCompletedAdminOnboardingTasks,
  getKuestSupportSettings,
  getSupportAnnouncementDismissedAt,
} from '@/lib/admin-support-settings'
import { cacheTags } from '@/lib/cache-tags'
import { DEFAULT_FEE_RECEIVER_WALLET_ADDRESS } from '@/lib/contracts'
import { SettingsRepository } from '@/lib/db/queries/settings'
import { getFeeRecipientWalletFormValue } from '@/lib/theme-settings'
import AppKitProvider from '@/providers/AppKitProvider'

export const instant = false

export const metadata: Metadata = {
  title: 'Admin',
}

function getForkRepositoryUrl() {
  const repoOwner = process.env.VERCEL_GIT_REPO_OWNER?.trim()
  const repoSlug = process.env.VERCEL_GIT_REPO_SLUG?.trim()

  if (!process.env.VERCEL_ENV || !repoOwner || !repoSlug) {
    return null
  }

  return `https://github.com/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoSlug)}`
}

export default async function AdminLayout({ params, children }: LayoutProps<'/[locale]/admin'>) {
  'use cache'

  cacheTag(cacheTags.settings)
  const { locale } = await params
  setRequestLocale(locale)
  const forkRepositoryUrl = getForkRepositoryUrl()
  const { data: settings } = await SettingsRepository.getSettings()
  const supportSettings = getKuestSupportSettings(settings)
  const feeRecipientWallet
    = getFeeRecipientWalletFormValue(settings ?? undefined) || DEFAULT_FEE_RECEIVER_WALLET_ADDRESS

  return (
    <AppKitProvider>
      <PlatformViewerState />
      <AdminSidebarProvider>
        <AdminCommandProvider>
          <div className="flex min-h-svh w-full bg-background">
            <AdminSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <AdminHeader feeRecipientWallet={feeRecipientWallet} />
              <main className="flex-1 px-4 py-6 lg:p-8">
                <div className="mx-auto w-full max-w-6xl space-y-8">
                  {children}
                </div>
              </main>
              <footer className="px-4 pb-6 lg:px-8">
                <div className="mx-auto w-full max-w-6xl">
                  <CopyVersion forkRepositoryUrl={forkRepositoryUrl} />
                </div>
              </footer>
            </div>
          </div>
        </AdminCommandProvider>
      </AdminSidebarProvider>
      {supportSettings.enabled && (
        <AdminOnboardingSupportWidget
          announcementDismissedAt={getSupportAnnouncementDismissedAt(settings)}
          initialCompletedTasks={getCompletedAdminOnboardingTasks(settings)}
          position={supportSettings.position}
        />
      )}
    </AppKitProvider>
  )
}
