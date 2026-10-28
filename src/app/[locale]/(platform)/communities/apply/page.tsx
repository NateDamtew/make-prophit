import { setRequestLocale } from 'next-intl/server'
import { Suspense } from 'react'

import type { SupportedLocale } from '@/i18n/locales'

import { listApplicationsForUser } from '@/lib/db/queries/applications'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'

import ApplicationStatus from './_components/ApplicationStatus'
import ApplyForm from './_components/ApplyForm'

export async function generateStaticParams() {
  return [{ locale: STATIC_PARAMS_PLACEHOLDER }]
}

async function ApplyContent() {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  const applications = user ? await listApplicationsForUser(user.id) : []
  const open =
    applications.find((application) => application.status === 'pending' || application.status === 'more_info') ?? null
  const latest = applications[0] ?? null
  if (open?.status === 'pending' || latest?.status === 'approved' || latest?.status === 'rejected') {
    return <ApplicationStatus application={open ?? latest!} />
  }
  return <ApplyForm signedIn={Boolean(user)} resume={open} />
}

export default async function ApplyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale as SupportedLocale)
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-secondary/40" />}>
        <ApplyContent />
      </Suspense>
    </main>
  )
}
