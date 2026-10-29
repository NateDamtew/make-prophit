import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getAdminActor } from '@/lib/admin-ui/guard'
import {
  COMMUNITY_APPEALS_KEY,
  COMMUNITY_HOLD_KEY,
  COMMUNITY_JURY_KEY,
  COMMUNITY_LEVELS_KEY_PREFIX,
  COMMUNITY_PROPHIT_IDS_KEY,
  COMMUNITY_REQUIRE_APPLICATION_KEY,
  COMMUNITY_SETTINGS_GROUP,
  COMMUNITY_STAKES_KEY_PREFIX,
  getCommunitySettings,
} from '@/lib/communities/settings'
import { SettingsRepository } from '@/lib/db/queries/settings'

/**
 * The `communities.*` settings for the admin page: every limit the pool
 * communities run on, read back through the same parser the engine uses,
 * so what the page shows is what the engine applies. Money is in minor
 * units as strings. One currency for now (KES).
 */

const CURRENCY = 'KES'

const minor = z.string().regex(/^\d+$/)
const bps = z.number().int().min(0).max(10_000)

const patchSchema = z.object({
  jury: z
    .object({
      bands: z
        .array(z.object({ maxMembers: z.number().int().positive().nullable(), seats: z.number().int().min(1).max(15) }))
        .min(1)
        .max(8),
      windowHours: z.number().int().min(1).max(720),
      minReasonChars: z.number().int().min(0).max(2_000),
    })
    .optional(),
  hold: z.object({ holdHours: z.number().min(0).max(720), appealMaxHours: z.number().min(0).max(1_440) }).optional(),
  appeals: z
    .object({
      minBackMinor: minor,
      backersNeeded: z.number().int().min(1).max(1_000),
      poolShareBps: bps,
      appealJurors: z.number().int().min(0).max(15),
    })
    .optional(),
  levels: z
    .record(
      z.enum(['0', '1', '2']),
      z.object({
        name: z.string().trim().min(1).max(40),
        rakeBps: z.number().int().min(0).max(2_000),
        ownerShareBps: bps,
        juryShareBps: bps,
        maxMembers: z.number().int().min(1).max(1_000_000),
        maxPoolPerMarketMinor: minor,
        maxPerPersonMinor: minor,
        reviewMode: z.enum(['every', 'spot', 'none']),
        spotCheckRate: z.number().min(0).max(1),
      }),
    )
    .optional(),
  stakes: z.object({ minStakeMinor: minor }).optional(),
  requireApplication: z.boolean().optional(),
  prophitCommunityIds: z.array(z.string().length(26)).max(50).optional(),
})

function serialize(settings: Awaited<ReturnType<typeof getCommunitySettings>>) {
  return {
    currency: CURRENCY,
    jury: settings.jury,
    hold: settings.hold,
    appeals: {
      minBackMinor: settings.appeals.minBackMinor.toString(),
      backersNeeded: settings.appeals.backersNeeded,
      poolShareBps: settings.appeals.poolShareBps,
      appealJurors: settings.appeals.appealJurors,
    },
    levels: Object.fromEntries(
      Object.entries(settings.levels).map(([level, caps]) => [
        level,
        {
          name: caps.name,
          rakeBps: caps.rakeBps,
          ownerShareBps: caps.ownerShareBps,
          juryShareBps: caps.juryShareBps,
          prophitShareBps: caps.prophitShareBps,
          maxMembers: caps.maxMembers,
          maxPoolPerMarketMinor: caps.maxPoolPerMarketMinor.toString(),
          maxPerPersonMinor: caps.maxPerPersonMinor.toString(),
          reviewMode: caps.reviewMode,
          spotCheckRate: caps.spotCheckRate,
        },
      ]),
    ),
    stakes: { minStakeMinor: settings.stakes.minStakeMinor.toString() },
    requireApplication: settings.requireApplication,
    prophitCommunityIds: settings.prophitCommunityIds,
  }
}

export type CommunitySettingsPayload = ReturnType<typeof serialize>

export async function GET() {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const settings = await getCommunitySettings(CURRENCY)
  return NextResponse.json({ data: serialize(settings) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(request: NextRequest) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 400 })
  }
  const input = parsed.data
  if (input.jury && input.jury.bands[input.jury.bands.length - 1]?.maxMembers !== null) {
    return NextResponse.json({ error: 'The last jury band must be open-ended (no member cap).' }, { status: 400 })
  }
  if (input.levels) {
    for (const [level, caps] of Object.entries(input.levels)) {
      if (caps.ownerShareBps + caps.juryShareBps > 10_000) {
        return NextResponse.json(
          { error: `Level ${level}: owner and jury shares exceed 100% of the rake.` },
          { status: 400 },
        )
      }
    }
  }
  const updates: Array<{ group: string; key: string; value: string }> = []
  const group = COMMUNITY_SETTINGS_GROUP
  if (input.jury) {
    updates.push({ group, key: COMMUNITY_JURY_KEY, value: JSON.stringify(input.jury) })
  }
  if (input.hold) {
    updates.push({ group, key: COMMUNITY_HOLD_KEY, value: JSON.stringify(input.hold) })
  }
  if (input.appeals) {
    updates.push({ group, key: COMMUNITY_APPEALS_KEY, value: JSON.stringify(input.appeals) })
  }
  if (input.levels) {
    updates.push({ group, key: `${COMMUNITY_LEVELS_KEY_PREFIX}${CURRENCY}`, value: JSON.stringify(input.levels) })
  }
  if (input.stakes) {
    updates.push({ group, key: `${COMMUNITY_STAKES_KEY_PREFIX}${CURRENCY}`, value: JSON.stringify(input.stakes) })
  }
  if (input.requireApplication !== undefined) {
    updates.push({ group, key: COMMUNITY_REQUIRE_APPLICATION_KEY, value: String(input.requireApplication) })
  }
  if (input.prophitCommunityIds) {
    updates.push({ group, key: COMMUNITY_PROPHIT_IDS_KEY, value: JSON.stringify(input.prophitCommunityIds) })
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })
  }
  const { error } = await SettingsRepository.updateSettings(updates)
  if (error) {
    return NextResponse.json({ error }, { status: 500 })
  }
  await recordAuditEvent({
    actor,
    action: 'community.settings_updated',
    targetType: 'settings',
    targetId: group,
    summary: `Updated ${updates.map((update) => update.key).join(', ')}`,
  })
  const settings = await getCommunitySettings(CURRENCY)
  return NextResponse.json({ data: serialize(settings) })
}
