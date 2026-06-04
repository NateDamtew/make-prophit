import { NextResponse } from 'next/server'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/locales'
import { agentApiError, resolveAgent, withAgentApiCors } from '@/lib/agent-api'
import { loadPlatformMainTags } from '@/lib/platform-main-tags'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return withAgentApiCors(new NextResponse(null, { status: 204 }))
}

/**
 * GET /api/v1/categories
 *
 * Public list of top-level market categories (politics, sports, crypto, etc.).
 * Agents use this to discover what `tag` values are valid on /api/v1/markets.
 */
export async function GET(request: Request) {
  try {
    await resolveAgent(request)
    const { searchParams } = new URL(request.url)
    const localeParam = (searchParams.get('locale') ?? DEFAULT_LOCALE).trim()
    const locale = SUPPORTED_LOCALES.includes(localeParam as typeof SUPPORTED_LOCALES[number])
      ? localeParam as typeof SUPPORTED_LOCALES[number]
      : DEFAULT_LOCALE

    const { data, error } = await loadPlatformMainTags(locale)
    if (error || !data) {
      return agentApiError(error ?? 'Could not load categories.', 500)
    }

    return withAgentApiCors(NextResponse.json({
      data: data.map(tag => ({
        slug: tag.slug,
        name: tag.name,
      })),
    }))
  }
  catch (error) {
    console.error('[/api/v1/categories] error', error)
    return agentApiError('Internal server error.', 500)
  }
}
