'use client'

import type { ReactNode } from 'react'
import type { ThemeMode } from '@/lib/theme-settings'
import { GoogleAnalytics } from '@next/third-parties/google'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { lazy, Suspense, useMemo } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { useSiteIdentity } from '@/hooks/useSiteIdentity'
import ProgressIndicatorProvider from '@/providers/ProgressIndicatorProvider'
import ThemeModeProvider from '@/providers/ThemeModeProvider'

const SpeedInsights = process.env.IS_VERCEL === 'true'
  ? lazy(async () => {
      const mod = await import('@vercel/speed-insights/next')
      return { default: mod.SpeedInsights }
    })
  : null

const queryClient = new QueryClient()

interface AppProvidersProps {
  children: ReactNode
  themeMode?: ThemeMode
}

export function AppProviders({ children, themeMode = 'both' }: AppProvidersProps) {
  const site = useSiteIdentity()
  const hasHydrated = useHasHydrated()
  const gaId = site.googleAnalyticsId
  const shouldRenderSpeedInsights = process.env.NODE_ENV === 'production' && hasHydrated

  const forcedTheme = useMemo(() => {
    if (themeMode === 'dark') return 'dark'
    if (themeMode === 'light') return 'light'
    return undefined
  }, [themeMode])

  const content = (
    <div className="min-h-screen bg-background">
      {children}
      <Toaster position="bottom-left" />
      {shouldRenderSpeedInsights && SpeedInsights && (
        <Suspense fallback={null}>
          <SpeedInsights />
        </Suspense>
      )}
      {process.env.NODE_ENV === 'production' && gaId && <GoogleAnalytics gaId={gaId} />}
    </div>
  )

  return (
    <ProgressIndicatorProvider>
      <ThemeModeProvider themeMode={themeMode}>
        <ThemeProvider attribute="class" forcedTheme={forcedTheme}>
          <QueryClientProvider client={queryClient}>
            {content}
          </QueryClientProvider>
        </ThemeProvider>
      </ThemeModeProvider>
    </ProgressIndicatorProvider>
  )
}

