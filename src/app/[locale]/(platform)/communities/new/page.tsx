import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { UserRepository } from '@/lib/db/queries/user'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'
import CreateCommunityForm from './_components/CreateCommunityForm'

export async function generateStaticParams() {
  return [{ locale: STATIC_PARAMS_PLACEHOLDER }]
}

async function AuthCheck() {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    redirect('/' as any)
  }
  return <CreateCommunityForm />
}

export default async function NewCommunityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Create a Community</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set up your own prediction market community with jury-governed resolution.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted/30" />}>
        <AuthCheck />
      </Suspense>
    </div>
  )
}
