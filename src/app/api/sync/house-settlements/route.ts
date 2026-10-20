import { creditResolvedPositions } from '@/lib/house/orders'
import { buildCronJsonResponse, handleCronRoute } from '@/lib/sync/cron-route'

export const maxDuration = 60

/**
 * Credits fixed local payouts for positions whose market has resolved
 * (markets.is_resolved + outcomes.payout_value from the market sync).
 * Schedule every 10 minutes: GET /api/sync/house-settlements with the cron secret.
 */
export async function GET(request: Request) {
  return handleCronRoute({
    request,
    jobName: 'house-settlements',
    handler: async () => {
      const result = await creditResolvedPositions()
      return buildCronJsonResponse({ success: true, ...result })
    },
  })
}
