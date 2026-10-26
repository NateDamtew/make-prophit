import { buildHmacSignature } from '@polymarket/client'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { UserRepository } from '@/lib/db/queries/user'
import { resolvePolymarketTradingAccess } from '@/lib/polymarket/trading-access'

/**
 * POST /api/polymarket/builder-sign — remote builder signing for the Polymarket
 * SDK running in the browser. The builder secret never
 * leaves the server; only tradable (logged-in, allowed, unrestricted-region)
 * users get signatures, so nobody else can spend Prophit's relayer quota.
 */

const SignRequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z
    .string()
    .min(1)
    .max(512)
    .regex(/^\/[\w\-./?=&%:,]*$/),
  body: z.string().max(65_536).optional(),
})

export async function POST(request: Request) {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  const access = resolvePolymarketTradingAccess(user, request.headers)
  if (!access.allowed) {
    return NextResponse.json({ error: 'Polymarket trading is not available for this account.' }, { status: 403 })
  }

  const key = process.env.POLYMARKET_BUILDER_API_KEY?.trim()
  const secret = process.env.POLYMARKET_BUILDER_SECRET?.trim()
  const passphrase = process.env.POLYMARKET_BUILDER_PASSPHRASE?.trim()
  if (!key || !secret || !passphrase) {
    return NextResponse.json({ error: 'Builder signing is not configured.' }, { status: 503 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const parsed = SignRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const signature = await buildHmacSignature(secret, timestamp, parsed.data.method, parsed.data.path, parsed.data.body)

  return NextResponse.json(
    {
      POLY_BUILDER_API_KEY: key,
      POLY_BUILDER_PASSPHRASE: passphrase,
      POLY_BUILDER_SIGNATURE: signature,
      POLY_BUILDER_TIMESTAMP: String(timestamp),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
