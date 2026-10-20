import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getFinanceActor } from '@/lib/admin-ui/finance-guard'
import { getAdminActor } from '@/lib/admin-ui/guard'
import {
  findAdminLedgerUser,
  listAdminLedgerEntries,
  postManualAdjustment,
  setUserFreezeFlags,
} from '@/lib/admin-ui/mobile-money-admin'
import { LedgerError } from '@/lib/ledger/service'

export async function GET(request: NextRequest) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''
  const accountId = searchParams.get('accountId')
  try {
    if (accountId) {
      const entries = await listAdminLedgerEntries(accountId, {
        limit: Math.min(Number.parseInt(searchParams.get('limit') || '50', 10) || 50, 200),
        before: searchParams.get('before') || undefined,
      })
      return NextResponse.json({ data: entries }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const user = await findAdminLedgerUser(query)
    if (!user) {
      return NextResponse.json({ data: null }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const entries = user.accountId ? await listAdminLedgerEntries(user.accountId, { limit: 50 }) : []
    return NextResponse.json({ data: { user, entries } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Admin ledger lookup error', error)
    return NextResponse.json({ error: 'Failed to load ledger.' }, { status: 500 })
  }
}

const adjustmentSchema = z.object({
  userId: z.string().min(10).max(40),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  direction: z.enum(['credit', 'debit']),
  amountMinor: z.string().regex(/^\d+$/),
  category: z.enum(['goodwill', 'correction', 'refund', 'chargeback', 'other']),
  reason: z.string().trim().min(5).max(500),
  idempotencyKey: z.string().min(8).max(64).optional(),
})

/** Manual adjustment (finance only). */
export async function POST(request: NextRequest) {
  const actor = await getFinanceActor()
  if (!actor) {
    return NextResponse.json({ error: 'Finance permission required.' }, { status: 403 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const parsed = adjustmentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 400 })
  }
  const amountMinor = BigInt(parsed.data.amountMinor)
  if (amountMinor <= 0n) {
    return NextResponse.json({ error: 'Amount must be positive.' }, { status: 400 })
  }
  const idempotencyKey = parsed.data.idempotencyKey ?? randomUUID()
  try {
    const result = await postManualAdjustment({
      userId: parsed.data.userId,
      currency: parsed.data.currency.toUpperCase(),
      amountMinor,
      direction: parsed.data.direction,
      reason: parsed.data.reason,
      category: parsed.data.category,
      actorUserId: actor.id,
      idempotencyKey,
    })
    await recordAuditEvent({
      actor,
      action: 'mobile_money.manual_adjustment',
      targetType: 'user',
      targetId: parsed.data.userId,
      summary: `${parsed.data.direction === 'credit' ? 'Credited' : 'Debited'} ${parsed.data.amountMinor} minor ${parsed.data.currency.toUpperCase()} (${parsed.data.category}): ${parsed.data.reason}`,
      diff: { ...parsed.data, transactionId: result.transactionId, alreadyPosted: result.alreadyPosted },
    })
    const user = await findAdminLedgerUser(parsed.data.userId)
    return NextResponse.json({
      data: { transactionId: result.transactionId, alreadyPosted: result.alreadyPosted, user },
    })
  } catch (error) {
    if (error instanceof LedgerError && error.code === 'insufficient_funds') {
      return NextResponse.json(
        { error: 'The user does not have enough available balance for that debit.' },
        { status: 409 },
      )
    }
    console.error('Admin manual adjustment error', error)
    return NextResponse.json({ error: 'Adjustment failed.' }, { status: 500 })
  }
}

const freezeSchema = z.object({
  userId: z.string().min(10).max(40),
  withdrawalsFrozen: z.boolean().optional(),
  tradingFrozen: z.boolean().optional(),
})

/** Freeze / unfreeze. Freezing is any admin; unfreezing needs finance. */
export async function PATCH(request: NextRequest) {
  const admin = await getAdminActor()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const parsed = freezeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 400 })
  }
  const isUnfreeze = parsed.data.withdrawalsFrozen === false || parsed.data.tradingFrozen === false
  const actor = isUnfreeze ? await getFinanceActor() : admin
  if (!actor) {
    return NextResponse.json({ error: 'Finance permission required to unfreeze.' }, { status: 403 })
  }
  try {
    const updated = await setUserFreezeFlags(parsed.data.userId, parsed.data)
    if (!updated) {
      return NextResponse.json({ error: 'User has no ledger profile yet.' }, { status: 404 })
    }
    await recordAuditEvent({
      actor,
      action: isUnfreeze ? 'mobile_money.user_unfrozen' : 'mobile_money.user_frozen',
      targetType: 'user',
      targetId: parsed.data.userId,
      summary: `withdrawals_frozen=${updated.withdrawals_frozen} trading_frozen=${updated.trading_frozen}`,
    })
    return NextResponse.json({ data: await findAdminLedgerUser(parsed.data.userId) })
  } catch (error) {
    console.error('Admin freeze error', error)
    return NextResponse.json({ error: 'Update failed.' }, { status: 500 })
  }
}
