import { closeExpiredPools, listUnsettledResolvedPools, settlePoolForMarket } from '@/lib/pools/service'
import { buildCronJsonResponse, handleCronRoute } from '@/lib/sync/cron-route'

export const maxDuration = 60

/**
 * Pool housekeeping: close pools past their resolution date and settle any
 * pool whose market resolved but whose settlement did not run (for example a
 * crash between the jury vote and the ledger write). Schedule every 5 minutes.
 */
export async function GET(request: Request) {
  return handleCronRoute({
    request,
    jobName: 'pool-settlements',
    handler: async () => {
      const closed = await closeExpiredPools()
      const pending = await listUnsettledResolvedPools()
      const settled: string[] = []
      const errors: Array<{ poolId: string; error: string }> = []
      for (const { pool } of pending) {
        try {
          const result = await settlePoolForMarket(pool.community_market_id)
          if (result && !result.alreadySettled) {
            settled.push(pool.id)
          }
        } catch (error) {
          errors.push({ poolId: pool.id, error: error instanceof Error ? error.message : String(error) })
        }
      }
      return buildCronJsonResponse({ success: errors.length === 0, closed, settled, errors })
    },
  })
}
