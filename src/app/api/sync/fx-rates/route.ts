import { refreshFxSnapshots } from '@/lib/fx/rates'
import { buildCronJsonResponse, handleCronRoute } from '@/lib/sync/cron-route'

export const maxDuration = 30

/**
 * Reference-rate refresh. Schedule every 10 minutes:
 *   GET /api/sync/fx-rates  (Authorization: Bearer <CRON_SECRET>)
 */
export async function GET(request: Request) {
  return handleCronRoute({
    request,
    jobName: 'fx-rates',
    handler: async () => {
      const result = await refreshFxSnapshots()
      return buildCronJsonResponse({ success: true, ...result })
    },
  })
}
