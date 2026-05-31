import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { loadRuntimeThemeState } from '@/lib/theme-settings'
import TmaProvider from './_components/TmaProvider'

export async function generateMetadata(): Promise<Metadata> {
  const runtimeTheme = await loadRuntimeThemeState()
  const site = runtimeTheme.site
  return {
    title: `${site.name} — Predict & Win`,
    description: site.description,
  }
}

export default async function TmaLayout({
  params,
  children,
}: {
  params: Promise<{ locale: string }>
  children: React.ReactNode
}) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TmaProvider>
        {children}
      </TmaProvider>
    </div>
  )
}
