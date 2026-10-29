/**
 * Cron: the jury pass over community markets past their close.
 *
 * For each active pool market whose close has passed: seat the jury if it
 * has none yet (markets from before seats existed), tell the seated jurors
 * their vote is due (once), then open and decide whatever is ready: every
 * seat voted, or the voting window ran out. A late jury refunds the market.
 */

import { NextResponse } from 'next/server'

import { isCronAuthorized } from '@/lib/auth-cron'
import { runJuryPass } from '@/lib/communities/jury-service'

export const maxDuration = 120

async function handle(request: Request) {
  const auth = request.headers.get('authorization')
  if (!isCronAuthorized(auth, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthenticated.' }, { status: 401 })
  }
  try {
    const result = await runJuryPass()
    return NextResponse.json({ success: result.errors.length === 0, ...result })
  } catch (err) {
    console.error('[sync/community-resolutions] Failed:', err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return handle(request)
}
export async function POST(request: Request) {
  return handle(request)
}
