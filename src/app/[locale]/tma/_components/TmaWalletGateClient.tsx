'use client'

import dynamic from 'next/dynamic'

const TmaWalletGateProvider = dynamic(
  () => import('./TmaWalletGate').then(m => ({ default: m.TmaWalletGateProvider })),
  { ssr: false },
)

export default function TmaWalletGateClient({ children }: { children: React.ReactNode }) {
  return <TmaWalletGateProvider>{children}</TmaWalletGateProvider>
}
