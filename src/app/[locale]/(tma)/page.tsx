import type { Event } from '@/types'
import { setRequestLocale } from 'next-intl/server'
import { listHomeEventsPage } from '@/lib/home-events-page'
import TmaBottomNav from './_components/TmaBottomNav'
import TmaHeader from './_components/TmaHeader'
import TmaMarketCard from './_components/TmaMarketCard'

async function loadEvents(locale: string) {
  try {
    const currentTimestamp = Math.floor(Date.now() / 1000)
    const { events } = await listHomeEventsPage({ currentTimestamp, locale })
    return events as Event[]
  }
  catch {
    return []
  }
}

export default async function TmaHomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const events = await loadEvents(locale)

  return (
    <main className="flex flex-col pb-20">
      <TmaHeader title="Markets" />
      <div className="flex flex-col gap-3 p-4">
        {events.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No markets available right now.
          </p>
        )}
        {events.map(event => (
          <TmaMarketCard key={event.id} event={event} locale={locale} />
        ))}
      </div>
      <TmaBottomNav />
    </main>
  )
}
