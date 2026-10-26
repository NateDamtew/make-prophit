import { sql } from 'drizzle-orm'
import { connection, NextResponse } from 'next/server'

import { DEFAULT_LOCALE } from '@/i18n/locales'
import { db } from '@/lib/drizzle'
import { listHomeEventsPage } from '@/lib/home-events-page'
import { getHomeFeaturedSideCard, listHomeFeaturedEvents, listHomeFeaturedHotTopics } from '@/lib/home-featured-events'
import { loadHomeFeedPools } from '@/lib/home-feed'
import { getHomeInitialCurrentTimestamp } from '@/lib/home-initial-events-cache'
import { collectTimings, timeStep } from '@/lib/perf-timing'
import { POLYMARKET_ENDPOINTS } from '@/lib/polymarket/endpoints'

/**
 * TEMPORARY: runs the steps the home page waits on (as in HomeContent) and
 * returns how long each took, because the `[perf]` log lines don't reach
 * Vercel's log viewer. Pass 2 repeats pass 1 on the same instance to show what
 * the in-memory 'use cache' saves. One run at a time. Remove with the fix.
 */
let running = false

async function runHomeSteps(pass: string) {
  const locale = DEFAULT_LOCALE
  const currentTimestamp = getHomeInitialCurrentTimestamp()
  await timeStep(`${pass} total`, () =>
    Promise.all([
      timeStep(`${pass} trending list`, () =>
        listHomeEventsPage({
          tag: 'trending',
          mainTag: 'trending',
          search: '',
          userId: '',
          bookmarked: false,
          locale,
          currentTimestamp,
        }),
      ),
      (async () => {
        const [featuredEvents, hotTopics] = await Promise.all([
          timeStep(`${pass} hero cards`, () => listHomeFeaturedEvents(locale)),
          timeStep(`${pass} hero hot topics`, () => listHomeFeaturedHotTopics(locale)),
        ])
        if (featuredEvents.length > 0) {
          await timeStep(`${pass} hero side card`, () => getHomeFeaturedSideCard(featuredEvents, hotTopics, locale))
        }
      })(),
      timeStep(`${pass} feed pools (all)`, () => loadHomeFeedPools({ locale, currentTimestamp })),
    ]),
  )
}

export async function GET() {
  await connection()
  if (running) {
    return NextResponse.json({ error: 'A timing run is already in progress' }, { status: 429 })
  }
  running = true
  try {
    const { totalMs, steps } = await collectTimings(async () => {
      for (const attempt of [1, 2, 3]) {
        await timeStep(`db ping ${attempt}`, () => db.execute(sql`SELECT 1`))
      }
      await timeStep('polymarket clob ping', () =>
        fetch(`${POLYMARKET_ENDPOINTS.clob}/time`, { signal: AbortSignal.timeout(10_000) }).then((response) =>
          response.text(),
        ),
      )
      await runHomeSteps('pass 1')
      await runHomeSteps('pass 2')
    })
    return NextResponse.json(
      { region: process.env.VERCEL_REGION ?? null, totalMs, steps },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('Home timing run failed', error)
    return NextResponse.json({ error: 'Home timing run failed' }, { status: 500 })
  } finally {
    running = false
  }
}
