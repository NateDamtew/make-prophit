import { getExtracted } from 'next-intl/server'

import AdminPolymarketCuration from '@/app/[locale]/admin/polymarket/_components/AdminPolymarketCuration'
import { listPolymarketCurationRules } from '@/lib/db/queries/polymarket-curation'

export const instant = false

export default async function AdminPolymarketPage() {
  const t = await getExtracted()
  const rules = await listPolymarketCurationRules()

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
      <AdminPolymarketCuration initialRules={rules} />
    </section>
  )
}
