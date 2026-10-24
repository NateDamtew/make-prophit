import { NextResponse } from 'next/server'
import { z } from 'zod'

import { SUPPORTED_LOCALES } from '@/i18n/locales'
import { parseOpenRouterProviderSettings } from '@/lib/ai/market-context-config'
import { SettingsRepository } from '@/lib/db/queries/settings'
import { UserRepository } from '@/lib/db/queries/user'
import { findHomeFeaturedNews } from '@/lib/home-featured-news'
import { isWorldNewsApiConfigured } from '@/lib/world-news-api'

const RequestSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  title: z.string().min(3).max(240),
  slug: z.string().max(240).optional().nullable(),
  newsSources: z.string().max(5000).optional().nullable(),
})

export async function POST(request: Request) {
  try {
    const currentUser = await UserRepository.getCurrentUser({ minimal: true })
    if (!currentUser || !currentUser.is_admin) {
      return NextResponse.json({ error: 'Unauthenticated.' }, { status: 401 })
    }

    const payload = await request.json().catch(() => null)
    const parsed = RequestSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
    }

    const { data: allSettings } = await SettingsRepository.getSettings()
    const openRouter = parseOpenRouterProviderSettings(allSettings ?? undefined)
    if (!openRouter.apiKey && !isWorldNewsApiConfigured()) {
      return NextResponse.json(
        { error: 'Set WORLD_NEWS_API_KEY or configure an OpenRouter API key to find news.' },
        { status: 400 },
      )
    }

    // World News API is tried first inside findHomeFeaturedNews; OpenRouter web search is the fallback.
    const items = await findHomeFeaturedNews(parsed.data, openRouter)
    return NextResponse.json({ items })
  } catch (error) {
    console.error('Failed to find featured context news', error)
    return NextResponse.json({ error: 'Could not find news for this featured market.' }, { status: 500 })
  }
}
