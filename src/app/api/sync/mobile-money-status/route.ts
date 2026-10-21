import { refreshDepositStatus } from '@/lib/mobile-money/deposits'
import { PaymentIntentRepository } from '@/lib/mobile-money/intents'
import { refreshPayoutStatus } from '@/lib/mobile-money/payouts'
import { isPawaPayConfigured } from '@/lib/pawapay/client'
import { buildCronJsonResponse, handleCronRoute } from '@/lib/sync/cron-route'

export const maxDuration = 60

const DEPOSIT_STALE_MS = 2 * 60_000
const PAYOUT_STALE_MS = 5 * 60_000
const BATCH_LIMIT = 40

/**
 * Status poller for payment intents whose callback has not arrived. Runs every
 * couple of minutes from the scheduler (see scripts/migrate.ts cron setup or
 * an external scheduler): GET /api/sync/mobile-money-status with the cron
 * bearer secret.
 */
export async function GET(request: Request) {
  return handleCronRoute({
    request,
    jobName: 'mobile-money-status',
    handler: async () => {
      if (!isPawaPayConfigured()) {
        return buildCronJsonResponse({ success: true, skipped: true, reason: 'pawaPay not configured' })
      }
      const stats = {
        deposits: { checked: 0, completed: 0, failed: 0, pending: 0 },
        payouts: { checked: 0, completed: 0, failed: 0, pending: 0 },
      }

      const deposits = await PaymentIntentRepository.listStalePending({
        kind: 'deposit',
        olderThanMs: DEPOSIT_STALE_MS,
        limit: BATCH_LIMIT,
      })
      for (const intent of deposits) {
        stats.deposits.checked++
        const result = await refreshDepositStatus(intent)
        if (result?.action === 'complete') {
          stats.deposits.completed++
        } else if (result?.action === 'fail') {
          stats.deposits.failed++
        } else {
          stats.deposits.pending++
        }
      }

      const payouts = await PaymentIntentRepository.listStalePending({
        kind: 'payout',
        olderThanMs: PAYOUT_STALE_MS,
        limit: BATCH_LIMIT,
      })
      for (const intent of payouts) {
        stats.payouts.checked++
        const result = await refreshPayoutStatus(intent)
        if (result?.action === 'complete') {
          stats.payouts.completed++
        } else if (result?.action === 'fail') {
          stats.payouts.failed++
        } else {
          stats.payouts.pending++
        }
      }

      return buildCronJsonResponse({ success: true, ...stats })
    },
  })
}
