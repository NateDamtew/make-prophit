import { setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import type { SupportedLocale } from '@/i18n/locales'

import { listMyPoolStakes } from '@/lib/db/queries/community-home'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'

import MyStakesList from './_components/MyStakesList'

export function generateStaticParams() {
  return [{ locale: STATIC_PARAMS_PLACEHOLDER }]
}

function Loading() {
  return (
    <div className="grid gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-secondary/50" />
      ))}
    </div>
  )
}

async function StakesContent() {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    redirect('/communities')
  }
  const stakes = await listMyPoolStakes(user.id)
  return <MyStakesList stakes={stakes} />
}

export default async function MyStakesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale as SupportedLocale)
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <Suspense fallback={<Loading />}>
        <StakesContent />
      </Suspense>
    </main>
  )
}
