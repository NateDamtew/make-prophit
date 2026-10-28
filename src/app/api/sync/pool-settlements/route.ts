import {
  closeExpiredPools,
  computePoolSettlement,
  listHeldPoolsDueForRelease,
  listUnsettledResolvedPools,
  releasePoolPayouts,
} from '@/lib/pools/service'
import { buildCronJsonResponse, handleCronRoute } from '@/lib/sync/cron-route'

export const maxDuration = 60

/**
 * Pool housekeeping, every 5 minutes:
 * 1. close pools past their resolution date;
 * 2. compute and hold payouts for any pool whose market resolved but whose
 *    settlement did not run (a crash between the jury vote and the write);
 * 3. release payouts whose hold has run out and that no appeal has frozen.
 */
export async function GET(request: Request) {
  return handleCronRoute({
    request,
    jobName: 'pool-settlements',
    handler: async () => {
      const now = new Date()
      const closed = await closeExpiredPools()
      const pending = await listUnsettledResolvedPools()
      const computed: string[] = []
      const released: string[] = []
      const errors: Array<{ poolId: string; error: string }> = []
      for (const { pool } of pending) {
        try {
          const result = await computePoolSettlement(pool.community_market_id, { now })
          if (result && !result.alreadySettled) {
            computed.push(pool.id)
            if (!result.held) {
              released.push(pool.id)
            }
          }
        } catch (error) {
          errors.push({ poolId: pool.id, error: error instanceof Error ? error.message : String(error) })
        }
      }
      for (const pool of await listHeldPoolsDueForRelease(now)) {
        try {
          const result = await releasePoolPayouts(pool.id, { now })
          if (result && !result.held && !result.alreadySettled) {
            released.push(pool.id)
          }
        } catch (error) {
          errors.push({ poolId: pool.id, error: error instanceof Error ? error.message : String(error) })
        }
      }
      return buildCronJsonResponse({ success: errors.length === 0, closed, computed, released, errors })
    },
  })
}
