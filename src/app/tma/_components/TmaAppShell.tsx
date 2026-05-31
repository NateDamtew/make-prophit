'use client'

import dynamic from 'next/dynamic'
import TmaProvider from './TmaProvider'

const AppKitProvider = dynamic(
  () => import('@/providers/AppKitProvider'),
  { ssr: false },
)

const TmaWalletGateProvider = dynamic(
  () => import('./TmaWalletGate').then(m => ({ default: m.TmaWalletGateProvider })),
  { ssr: false },
)

export default function TmaAppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppKitProvider>
      <TmaProvider>
        <TmaWalletGateProvider>
          {children}
        </TmaWalletGateProvider>
      </TmaProvider>
    </AppKitProvider>
  )
}
