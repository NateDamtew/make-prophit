import type { Event } from '@/types'
import { setRequestLocale } from 'next-intl/server'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/locales'
import { listHomeEventsPage } from '@/lib/home-events-page'
import TmaBottomNav from './_components/TmaBottomNav'
import TmaHeader from './_components/TmaHeader'
import TmaMarketCard from './_components/TmaMarketCard'
import TmaWalletOnboarding from './_components/TmaWalletOnboarding'

async function loadEvents(locale: string): Promise<Event[]> {
  try {
    const resolvedLocale = SUPPORTED_LOCALES.includes(locale as any) ? locale as any : DEFAULT_LOCALE
    const currentTimestamp = Math.floor(Date.now() / 1000)
    const result = await listHomeEventsPage({
      tag: 'trending',
      mainTag: '',
      search: '',
      sortBy: undefined,
      userId: '',
      bookmarked: false,
      locale: resolvedLocale,
      currentTimestamp,
      offset: 0,
    })
    return (result as any).data ?? []
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
      <TmaWalletOnboarding />
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
