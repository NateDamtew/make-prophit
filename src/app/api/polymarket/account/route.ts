import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { UserRepository } from '@/lib/db/queries/user'
import { polymarket_accounts } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'

/**
 * GET  /api/polymarket/account — the signed-in user's saved Polymarket wallet (or null).
 * POST /api/polymarket/account — save it after trading setup. The signer must be
 *      the user's own login wallet; the wallet is public on-chain data.
 */

const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const SaveSchema = z.object({ wallet: z.string().regex(ADDRESS), signer: z.string().regex(ADDRESS) })

export async function GET() {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    return NextResponse.json({ wallet: null }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
  const [row] = await db
    .select({ wallet: polymarket_accounts.wallet_address })
    .from(polymarket_accounts)
    .where(eq(polymarket_accounts.user_id, user.id))
    .limit(1)
  return NextResponse.json({ wallet: row?.wallet ?? null }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  }
  const parsed = SaveSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const loginAddress = typeof user.address === 'string' ? user.address.toLowerCase() : ''
  if (!loginAddress || loginAddress !== parsed.data.signer.toLowerCase()) {
    return NextResponse.json({ error: 'That wallet does not belong to this account.' }, { status: 403 })
  }

  const values = {
    user_id: user.id,
    wallet_address: parsed.data.wallet.toLowerCase(),
    signer_address: parsed.data.signer.toLowerCase(),
  }
  await db
    .insert(polymarket_accounts)
    .values(values)
    .onConflictDoUpdate({
      target: [polymarket_accounts.user_id],
      set: { wallet_address: values.wallet_address, signer_address: values.signer_address },
    })
  return NextResponse.json({ ok: true })
}
