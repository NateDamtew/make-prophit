import { syncCommunityTrust } from '@/lib/communities/trust-sync'
import { buildCronJsonResponse, handleCronRoute } from '@/lib/sync/cron-route'

export const maxDuration = 60

/**
 * Nightly: trust scores, promotions, dormancy, and the jury size / member
 * cap each community's level and size entitle it to.
 */
export async function GET(request: Request) {
  return handleCronRoute({
    request,
    jobName: 'community-trust',
    handler: async () => {
      const result = await syncCommunityTrust(new Date())
      return buildCronJsonResponse({ success: result.errors.length === 0, ...result })
    },
  })
}
