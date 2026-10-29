'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { AppealError, backAppeal, fileAppeal, withdrawAppeal } from '@/lib/communities/appeals-service'
import { UserRepository } from '@/lib/db/queries/user'
import { parseAmountToMinorUnits } from '@/lib/pawapay/amounts'

/**
 * Appeals from the market page: file one, back one with escrow, take one
 * back. Rulings are Prophit's and live under the admin API.
 */

const NOT_SIGNED_IN = 'You must be signed in.'

const FileSchema = z.object({
  marketId: z.string().min(1),
  communitySlug: z.string().min(1),
  claimedOutcome: z.enum(['yes', 'no', 'cancelled']),
  reason: z.string().trim().min(40, 'Say why the jury is wrong in at least 40 characters.').max(2_000),
  evidence: z
    .array(
      z.object({
        type: z.enum(['link', 'photo']),
        url: z.string().url(),
        label: z.string().trim().max(120).optional().nullable(),
      }),
    )
    .max(5)
    .default([]),
})

function describe(error: unknown, fallback: string) {
  return error instanceof AppealError ? error.message : fallback
}

export async function fileAppealAction(input: z.input<typeof FileSchema>) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { data: null, error: NOT_SIGNED_IN }
  }
  const parsed = FileSchema.safeParse(input)
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? 'Check the form.' }
  }
  try {
    const appeal = await fileAppeal({
      marketId: parsed.data.marketId,
      userId: user.id,
      claimedOutcome: parsed.data.claimedOutcome,
      reason: parsed.data.reason,
      evidence: parsed.data.evidence,
    })
    revalidatePath(`/community/${parsed.data.communitySlug}/market/${parsed.data.marketId}`, 'layout')
    return { data: { appealId: appeal.id }, error: null }
  } catch (error) {
    if (!(error instanceof AppealError)) {
      console.error('[appeals] file failed', error)
    }
    return { data: null, error: describe(error, 'Could not file the appeal right now.') }
  }
}

export async function backAppealAction(input: {
  appealId: string
  marketId: string
  communitySlug: string
  amountInput: string
}) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { data: null, error: NOT_SIGNED_IN }
  }
  let amountMinor: bigint
  try {
    amountMinor = parseAmountToMinorUnits(input.amountInput)
  } catch {
    return { data: null, error: 'Please enter a valid amount.' }
  }
  try {
    const result = await backAppeal({ appealId: input.appealId, userId: user.id, amountMinor })
    revalidatePath(`/community/${input.communitySlug}/market/${input.marketId}`, 'layout')
    return {
      data: {
        backerCount: result.appeal.backer_count,
        escrowTotalMinor: result.appeal.escrow_total.toString(),
        thresholdMet: result.thresholdMet,
      },
      error: null,
    }
  } catch (error) {
    if (!(error instanceof AppealError)) {
      console.error('[appeals] back failed', error)
    }
    return { data: null, error: describe(error, 'Could not back the appeal right now.') }
  }
}

export async function withdrawAppealAction(input: { appealId: string; marketId: string; communitySlug: string }) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { data: null, error: NOT_SIGNED_IN }
  }
  try {
    await withdrawAppeal({ appealId: input.appealId, userId: user.id })
    revalidatePath(`/community/${input.communitySlug}/market/${input.marketId}`, 'layout')
    return { data: { ok: true }, error: null }
  } catch (error) {
    if (!(error instanceof AppealError)) {
      console.error('[appeals] withdraw failed', error)
    }
    return { data: null, error: describe(error, 'Could not withdraw the appeal right now.') }
  }
}
