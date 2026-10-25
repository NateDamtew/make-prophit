import { runPolymarketSync } from '@/lib/polymarket/sync'
import {
  buildCronErrorResponse,
  buildSyncAlreadyRunningResponse,
  handleCronRoute,
  tryAcquireSyncLock,
  updateSyncStatus,
} from '@/lib/sync/cron-route'

export const maxDuration = 300

const POLYMARKET_SYNC_STATE = {
  serviceName: 'polymarket_sync',
  subgraphName: 'gamma',
} as const
const SYNC_DEADLINE_MS = 270_000

/** Imports the admin-curated Polymarket catalogue (see src/lib/polymarket/sync.ts). */
export async function GET(request: Request) {
  const startedAt = Date.now()

  return handleCronRoute({
    request,
    jobName: 'polymarket-sync',
    handler: async () => {
      if (!(await tryAcquireSyncLock(POLYMARKET_SYNC_STATE))) {
        return buildSyncAlreadyRunningResponse()
      }

      const summary = await runPolymarketSync({ deadlineMs: startedAt + SYNC_DEADLINE_MS })
      await updateSyncStatus({
        ...POLYMARKET_SYNC_STATE,
        status: 'completed',
        errorMessage: summary.errors.length > 0 ? `${summary.errors.length} item(s) failed` : null,
        totalProcessed: summary.imported,
      })

      return { success: true, ...summary }
    },
    onError: async (error) => {
      await updateSyncStatus({
        ...POLYMARKET_SYNC_STATE,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      return buildCronErrorResponse(error)
    },
  })
}
