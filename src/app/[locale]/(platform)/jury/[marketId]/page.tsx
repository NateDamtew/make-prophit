import { setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'

import type { SupportedLocale } from '@/i18n/locales'

import { getJuryInbox, getVotePageData } from '@/lib/communities/jury-service'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'

import VoteForm from './_components/VoteForm'

export function generateStaticParams() {
  return [{ locale: STATIC_PARAMS_PLACEHOLDER, marketId: STATIC_PARAMS_PLACEHOLDER }]
}

/** The request clock, read once per render after `connection()`. */
function requestTimestamp() {
  return Date.now()
}

function Loading() {
  return <div className="h-96 animate-pulse rounded-xl bg-secondary/50" />
}

async function VoteContent({ marketId }: { marketId: string }) {
  await connection()
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    redirect('/jury')
  }
  const [data, inbox] = await Promise.all([getVotePageData(marketId, user.id), getJuryInbox(user.id)])
  if (!data) {
    notFound()
  }
  const nextDue = inbox.due.find((item) => item.marketId !== marketId && item.myVote === null) ?? null
  return (
    <VoteForm
      data={data}
      username={user.username ?? null}
      nextDue={nextDue ? { marketId: nextDue.marketId, title: nextDue.title, dueAt: nextDue.dueAt } : null}
      serverNow={requestTimestamp()}
    />
  )
}

export default async function JuryVotePage({ params }: { params: Promise<{ locale: string; marketId: string }> }) {
  const { locale, marketId } = await params
  setRequestLocale(locale as SupportedLocale)
  if (marketId === STATIC_PARAMS_PLACEHOLDER) {
    notFound()
  }
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-28 sm:px-6 lg:pb-10">
      <Suspense fallback={<Loading />}>
        <VoteContent marketId={marketId} />
      </Suspense>
    </main>
  )
}
