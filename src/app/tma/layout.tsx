import type { Metadata } from 'next'
import { loadRuntimeThemeState } from '@/lib/theme-settings'
import AppKitProvider from '@/providers/AppKitProvider'
import TmaProvider from './_components/TmaProvider'
import TmaWalletGateClient from './_components/TmaWalletGateClient'

export async function generateMetadata(): Promise<Metadata> {
  const runtimeTheme = await loadRuntimeThemeState()
  const site = runtimeTheme.site
  return {
    title: `${site.name} — Predict & Win`,
    description: site.description,
  }
}

export default function TmaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppKitProvider>
        <TmaProvider>
          <TmaWalletGateClient>
            {children}
          </TmaWalletGateClient>
        </TmaProvider>
      </AppKitProvider>
    </div>
  )
}
