import { runReconciliation } from '@/lib/ledger/reconciliation'
import { buildCronJsonResponse, handleCronRoute } from '@/lib/sync/cron-route'

export const maxDuration = 120

/**
 * Nightly ledger reconciliation. Schedule once a day (e.g. 03:15 UTC):
 *   GET /api/sync/reconcile  (Authorization: Bearer <CRON_SECRET>)
 * A failed check pauses payouts and trading for the affected currency and
 * notifies platform admins; see the Reconciliation page in admin.
 */
export async function GET(request: Request) {
  return handleCronRoute({
    request,
    jobName: 'reconcile',
    handler: async () => {
      const report = await runReconciliation()
      return buildCronJsonResponse({
        success: report.failed.length === 0,
        runId: report.runId,
        failed: report.failed.map((result) => `${result.check}${result.currency ? `:${result.currency}` : ''}`),
        pausedCurrencies: report.pausedCurrencies,
        results: report.results.map((result) => ({
          check: result.check,
          currency: result.currency,
          status: result.status,
          delta: result.delta ?? null,
        })),
      })
    },
  })
}
