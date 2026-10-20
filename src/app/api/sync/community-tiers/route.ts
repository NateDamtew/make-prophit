import { evaluateCommunityTiers } from '@/lib/pools/tiering'
import { buildCronJsonResponse, handleCronRoute } from '@/lib/sync/cron-route'

export const maxDuration = 60

/** Nightly community tier evaluation: GET /api/sync/community-tiers with the cron bearer secret. */
export async function GET(request: Request) {
  return handleCronRoute({
    request,
    jobName: 'community-tiers',
    handler: async () => {
      const result = await evaluateCommunityTiers()
      return buildCronJsonResponse({ success: true, ...result })
    },
  })
}
