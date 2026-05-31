'use client'

import dynamic from 'next/dynamic'

const TmaWalletOnboarding = dynamic(
  () => import('./TmaWalletOnboarding'),
  { ssr: false },
)

export default function TmaWalletOnboardingClient() {
  return <TmaWalletOnboarding />
}
