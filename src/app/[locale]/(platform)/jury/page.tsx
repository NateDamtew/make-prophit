import { setRequestLocale } from 'next-intl/server'
import { connection } from 'next/server'
import { Suspense } from 'react'

import type { SupportedLocale } from '@/i18n/locales'

import { getJuryInbox } from '@/lib/communities/jury-service'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'

import JuryInbox from './_components/JuryInbox'
import JurySignedOut from './_components/JurySignedOut'

export function generateStaticParams() {
  return [{ locale: STATIC_PARAMS_PLACEHOLDER }]
}

/** The request clock, read once per render after `connection()`. */
function requestTimestamp() {
  return Date.now()
}

function Loading() {
  return (
    <div className="grid gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-secondary/50" />
      ))}
    </div>
  )
}

async function InboxContent() {
  await connection()
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    return <JurySignedOut />
  }
  const inbox = await getJuryInbox(user.id)
  return <JuryInbox inbox={inbox} username={user.username ?? null} serverNow={requestTimestamp()} />
}

export default async function JuryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale as SupportedLocale)
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 pb-28 sm:px-6 lg:pb-10">
      <Suspense fallback={<Loading />}>
        <InboxContent />
      </Suspense>
    </main>
  )
}
