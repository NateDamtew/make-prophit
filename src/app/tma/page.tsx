import type { Event } from '@/types'
import { DEFAULT_LOCALE } from '@/i18n/locales'
import { listHomeEventsPage } from '@/lib/home-events-page'
import TmaBottomNav from './_components/TmaBottomNav'
import TmaHeader from './_components/TmaHeader'
import TmaMarketCard from './_components/TmaMarketCard'
import TmaWalletOnboardingClient from './_components/TmaWalletOnboardingClient'

async function loadEvents(): Promise<Event[]> {
  try {
    const currentTimestamp = Math.floor(Date.now() / 1000)
    const result = await listHomeEventsPage({
      tag: 'trending',
      mainTag: '',
      search: '',
      sortBy: undefined,
      userId: '',
      bookmarked: false,
      locale: DEFAULT_LOCALE,
      currentTimestamp,
      offset: 0,
    })
    return (result as any).data ?? []
  }
  catch {
    return []
  }
}

export default async function TmaHomePage() {
  const events = await loadEvents()

  return (
    <main className="flex flex-col pb-20">
      <TmaHeader title="Markets" />
      <TmaWalletOnboardingClient />
      <div className="flex flex-col gap-3 p-4">
        {events.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No markets available right now.
          </p>
        )}
        {events.map(event => (
          <TmaMarketCard key={event.id} event={event} />
        ))}
      </div>
      <TmaBottomNav />
    </main>
  )
}
