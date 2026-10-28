'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { ApplicationView } from '@/lib/db/queries/applications'

import { isLeaderType } from '@/lib/communities/rules'
import { createApplication, getOpenApplicationForUser, updateApplication } from '@/lib/db/queries/applications'
import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'

/**
 * Applying to lead a community. One open application per person.
 */

const SampleMarketSchema = z.object({
  title: z.string().trim().min(12, 'Each sample market needs a full question.').max(200),
  source: z.string().trim().min(3, 'Say where the answer will come from.').max(300),
  closesAt: z.string().trim().optional().nullable(),
})

const ApplySchema = z.object({
  leaderType: z.string().refine(isLeaderType, 'Pick what kind of leader you are.'),
  name: z.string().trim().min(3, 'Give the community a name.').max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/, 'Use 3–40 letters, numbers and dashes.'),
  description: z.string().trim().min(40, 'Tell us what the community predicts, in a sentence or two.').max(1_000),
  audience: z.string().trim().max(300).optional().nullable(),
  sampleMarkets: z.array(SampleMarketSchema).min(3, 'Give at least three sample markets.').max(5),
  links: z.array(z.string().trim().url('Links must be full URLs.')).max(5),
  currency: z.string().trim().length(3).default('KES'),
})

export type ApplyInput = z.input<typeof ApplySchema>

export async function applyToLeadAction(
  input: ApplyInput,
): Promise<{ data: ApplicationView | null; error: string | null }> {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { data: null, error: 'Sign in first.' }
  }
  const parsed = ApplySchema.safeParse(input)
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0]?.message ?? 'Check the form.' }
  }
  const open = await getOpenApplicationForUser(user.id)
  if (open && open.status === 'pending') {
    return { data: open, error: 'You already have an application waiting. We will get back to you.' }
  }
  const taken = await CommunityRepository.getBySlug(parsed.data.slug)
  if (taken.data) {
    return { data: null, error: 'That address is taken. Pick another.' }
  }
  const sampleMarkets = parsed.data.sampleMarkets.map((market) => ({
    title: market.title,
    source: market.source,
    closesAt: market.closesAt || null,
  }))
  const saved =
    open && open.status === 'more_info'
      ? await updateApplication(open.id, user.id, {
          description: parsed.data.description,
          audience: parsed.data.audience ?? null,
          sampleMarkets,
          links: parsed.data.links,
        })
      : await createApplication({
          userId: user.id,
          leaderType: parsed.data.leaderType,
          name: parsed.data.name,
          slug: parsed.data.slug,
          description: parsed.data.description,
          audience: parsed.data.audience ?? null,
          sampleMarkets,
          links: parsed.data.links,
          currency: parsed.data.currency.toUpperCase(),
        })
  if (!saved) {
    return { data: null, error: 'Could not save the application.' }
  }
  revalidatePath('/communities/apply', 'layout')
  return { data: saved, error: null }
}
