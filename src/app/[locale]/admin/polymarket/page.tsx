import { getExtracted } from 'next-intl/server'
import { connection } from 'next/server'
import { Suspense } from 'react'

import AdminPageSkeleton from '@/app/[locale]/admin/_components/AdminPageSkeleton'
import AdminPolymarketCuration from '@/app/[locale]/admin/polymarket/_components/AdminPolymarketCuration'
import { listPolymarketCurationRules } from '@/lib/db/queries/polymarket-curation'

export const instant = false

/** Rules are read per request (never at build time) so edits show immediately. */
async function AdminPolymarketCurationContent() {
  await connection()
  const rules = await listPolymarketCurationRules()
  return <AdminPolymarketCuration initialRules={rules} />
}

export default async function AdminPolymarketPage() {
  const t = await getExtracted()

  return (
    <section className="grid gap-4">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">{t('Polymarket markets')}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            'Choose which Polymarket categories, leagues, events and markets appear in Prophit. Nothing shows unless you switch it on; event and market choices override categories.',
          )}
        </p>
      </div>
      <Suspense fallback={<AdminPageSkeleton />}>
        <AdminPolymarketCurationContent />
      </Suspense>
    </section>
  )
}
