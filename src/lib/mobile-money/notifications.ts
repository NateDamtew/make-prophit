import { notifications } from '@/lib/db/schema/notifications/tables'
import { db } from '@/lib/drizzle'
import { formatMinorUnitsForDisplay } from '@/lib/pawapay/amounts'

/**
 * In-app notifications for the mobile-money rail. Never throws: a failed
 * notification must not roll back the money movement it describes.
 */

export type MobileMoneyNotificationKind =
  | 'mobile_money_deposit_completed'
  | 'mobile_money_deposit_failed'
  | 'mobile_money_payout_completed'
  | 'mobile_money_payout_failed'

async function create(input: {
  userId: string
  category: MobileMoneyNotificationKind
  title: string
  description: string
  metadata?: Record<string, unknown>
}) {
  try {
    // The notifications table only allows 'trade' | 'system' | 'general'; the
    // specific kind travels in metadata so the inbox can still style it.
    await db.insert(notifications).values({
      user_id: input.userId,
      category: 'general',
      title: input.title,
      description: input.description,
      link_type: 'none',
      metadata: { ...(input.metadata ?? {}), kind: input.category },
    })
  } catch (error) {
    console.error('[mobile-money] failed to create notification', { category: input.category, error })
  }
}

export function formatLocalAmount(amountMinor: bigint, currency: string) {
  return `${formatMinorUnitsForDisplay(amountMinor, { trimWholeNumbers: true })} ${currency}`
}

export const MobileMoneyNotifications = {
  depositCompleted(params: { userId: string; intentId: string; amountMinor: bigint; currency: string }) {
    return create({
      userId: params.userId,
      category: 'mobile_money_deposit_completed',
      title: 'Deposit received',
      description: `${formatLocalAmount(params.amountMinor, params.currency)} has been added to your balance.`,
      metadata: { intentId: params.intentId },
    })
  },
  depositFailed(params: { userId: string; intentId: string; amountMinor: bigint; currency: string; reason: string }) {
    return create({
      userId: params.userId,
      category: 'mobile_money_deposit_failed',
      title: 'Deposit not completed',
      description: `Your deposit of ${formatLocalAmount(params.amountMinor, params.currency)} did not go through. ${params.reason}`,
      metadata: { intentId: params.intentId },
    })
  },
  payoutCompleted(params: { userId: string; intentId: string; netMinor: bigint; currency: string }) {
    return create({
      userId: params.userId,
      category: 'mobile_money_payout_completed',
      title: 'Withdrawal sent',
      description: `${formatLocalAmount(params.netMinor, params.currency)} is on its way to your mobile money account.`,
      metadata: { intentId: params.intentId },
    })
  },
  payoutFailed(params: { userId: string; intentId: string; grossMinor: bigint; currency: string; reason: string }) {
    return create({
      userId: params.userId,
      category: 'mobile_money_payout_failed',
      title: 'Withdrawal returned',
      description: `Your withdrawal of ${formatLocalAmount(params.grossMinor, params.currency)} could not be sent and has been returned to your balance. ${params.reason}`,
      metadata: { intentId: params.intentId },
    })
  },
}
