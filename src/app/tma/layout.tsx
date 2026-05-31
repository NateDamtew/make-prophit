import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { loadRuntimeThemeState } from '@/lib/theme-settings'
import SiteIdentityProvider from '@/providers/SiteIdentityProvider'
import TmaAppShell from './_components/TmaAppShell'

export async function generateMetadata(): Promise<Metadata> {
  const runtimeTheme = await loadRuntimeThemeState()
  const site = runtimeTheme.site
  return {
    title: `${site.name} — Predict & Win`,
    description: site.description,
  }
}

export default async function TmaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const runtimeTheme = await loadRuntimeThemeState()

  return (
    <NextIntlClientProvider locale="en">
      <SiteIdentityProvider site={runtimeTheme.site}>
        <div className="flex min-h-screen flex-col bg-background text-foreground">
          <TmaAppShell>
            {children}
          </TmaAppShell>
        </div>
      </SiteIdentityProvider>
    </NextIntlClientProvider>
  )
}
