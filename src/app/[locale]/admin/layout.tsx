'use cache'

import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import PlatformViewerState from '@/app/[locale]/(platform)/_components/PlatformViewerState'
import AdminHeader from '@/app/[locale]/admin/_components/AdminHeader'
import AdminSidebar from '@/app/[locale]/admin/_components/AdminSidebar'
import CopyVersion from '@/app/[locale]/admin/_components/CopyVersion'
import { AdminCommandProvider } from '@/components/admin-ui/CommandPalette'
import { AdminSidebarProvider } from '@/components/admin-ui/shell/SidebarProvider'
import AppKitProvider from '@/providers/AppKitProvider'

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
  const { locale } = await params
  setRequestLocale(locale)
  const forkRepositoryUrl = getForkRepositoryUrl()

  return (
    <AppKitProvider>
      <PlatformViewerState />
      <AdminSidebarProvider>
        <AdminCommandProvider>
          <div className="flex min-h-svh w-full bg-background">
            <AdminSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <AdminHeader />
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
    </AppKitProvider>
  )
}
