import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getFinanceActor } from '@/lib/admin-ui/finance-guard'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { getAdminIntent } from '@/lib/admin-ui/mobile-money-admin'
import { applyDepositStatus, refreshDepositStatus } from '@/lib/mobile-money/deposits'
import { PaymentIntentRepository } from '@/lib/mobile-money/intents'
import { applyPayoutStatus, refreshPayoutStatus } from '@/lib/mobile-money/payouts'
import { getPawaPayClient, PawaPayApiError } from '@/lib/pawapay/client'

const actionSchema = z.object({
  action: z.enum(['recheck', 'resend_callback', 'fail_enqueued', 'mark_failed', 'mark_completed']),
  reason: z.string().trim().min(3).max(500).optional(),
})

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const { id } = await params
  const intent = await getAdminIntent(id)
  if (!intent) {
    return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })
  }
  const events = await PaymentIntentRepository.listCallbackEvents(id)
  return NextResponse.json(
    {
      data: {
        ...intent,
        callbackEvents: events.map((event) => ({
          fingerprint: event.fingerprint,
          status: event.status,
          signatureVerified: event.signature_verified,
          signatureKeyId: event.signature_key_id,
          receivedAt: event.received_at.toISOString(),
          payload: event.payload,
        })),
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * Operator actions on one intent. `recheck`, `resend_callback` and
 * `fail_enqueued` are safe for any admin. `mark_failed` and `mark_completed`
 * move money or release holds by hand and need the finance capability plus a
 * reason; both are audit-logged with before/after.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminActor()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const { id } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const parsed = actionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 400 })
  }
  const intent = await PaymentIntentRepository.getById(id)
  if (!intent) {
    return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })
  }
  const { action, reason } = parsed.data

  try {
    if (action === 'recheck') {
      const result = intent.kind === 'deposit' ? await refreshDepositStatus(intent) : await refreshPayoutStatus(intent)
      await recordAuditEvent({
        actor: admin,
        action: 'mobile_money.intent_rechecked',
        targetType: 'payment_intent',
        targetId: id,
        summary: `Re-checked ${intent.kind} → ${result?.state ?? intent.state}`,
      })
      return NextResponse.json({ data: await getAdminIntent(id), result })
    }

    if (action === 'resend_callback') {
      const client = getPawaPayClient()
      if (intent.kind === 'deposit') {
        await client.resendDepositCallback(intent.provider_ref)
      } else {
        await client.resendPayoutCallback(intent.provider_ref)
      }
      await recordAuditEvent({
        actor: admin,
        action: 'mobile_money.callback_resend_requested',
        targetType: 'payment_intent',
        targetId: id,
        summary: `Asked pawaPay to resend the ${intent.kind} callback`,
      })
      return NextResponse.json({ data: await getAdminIntent(id) })
    }

    if (action === 'fail_enqueued') {
      if (intent.kind !== 'payout') {
        return NextResponse.json({ error: 'Only payouts can be cancelled while enqueued.' }, { status: 400 })
      }
      await getPawaPayClient().failEnqueuedPayout(intent.provider_ref)
      await recordAuditEvent({
        actor: admin,
        action: 'mobile_money.payout_cancel_requested',
        targetType: 'payment_intent',
        targetId: id,
        summary: 'Requested cancellation of an enqueued payout',
      })
      return NextResponse.json({ data: await getAdminIntent(id) })
    }

    // Manual overrides: finance only, reason required.
    const finance = await getFinanceActor()
    if (!finance) {
      return NextResponse.json({ error: 'Finance permission required.' }, { status: 403 })
    }
    if (!reason) {
      return NextResponse.json({ error: 'A reason is required for manual overrides.' }, { status: 400 })
    }
    if (intent.state !== 'initiated' && intent.state !== 'pending') {
      return NextResponse.json({ error: `Payment is already ${intent.state}.` }, { status: 409 })
    }
    const before = await getAdminIntent(id)
    const record =
      action === 'mark_completed'
        ? { status: 'COMPLETED' as const, providerTransactionId: `MANUAL:${finance.id}` }
        : { status: 'FAILED' as const, failureReason: { failureCode: 'MANUAL_OVERRIDE', failureMessage: reason } }
    const result =
      intent.kind === 'deposit'
        ? await applyDepositStatus(id, record, 'status_check')
        : await applyPayoutStatus(id, record, 'status_check')
    const after = await getAdminIntent(id)
    await recordAuditEvent({
      actor: finance,
      action:
        action === 'mark_completed' ? 'mobile_money.intent_marked_completed' : 'mobile_money.intent_marked_failed',
      targetType: 'payment_intent',
      targetId: id,
      summary: `${action === 'mark_completed' ? 'Marked completed' : 'Marked failed'}: ${reason}`,
      diff: { before, after, reason },
    })
    return NextResponse.json({ data: after, result })
  } catch (error) {
    console.error('Admin payment action error', { id, action, error })
    const message =
      error instanceof PawaPayApiError ? `pawaPay: ${error.failureCode ?? error.status}` : 'Action failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
