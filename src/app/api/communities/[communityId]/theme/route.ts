import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { CommunityRepository } from '@/lib/db/queries/community'
import { CommunityThemeRepository, isSafeAccent } from '@/lib/db/queries/community-theme'
import { FONT_HINTS, LAYOUT_PRESETS, SURFACE_MODES } from '@/lib/db/schema/communities/themes'
import { UserRepository } from '@/lib/db/queries/user'

const patchSchema = z.object({
  layout_preset: z.enum(LAYOUT_PRESETS).optional(),
  accent: z.string().trim().max(64).nullable().optional(),
  surface_mode: z.enum(SURFACE_MODES).optional(),
  font_hint: z.enum(FONT_HINTS).optional(),
  hidden_sections: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  featured_market_id: z.string().length(26).nullable().optional(),
})

async function gate(communityId: string) {
  const viewer = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!viewer) {
    return { error: 'Sign in to edit theme.', viewer: null, status: 401 as const }
  }
  if (viewer.is_admin) {
    return { error: null, viewer, status: 200 as const }
  }
  const { data: role } = await CommunityRepository.getMemberRole(communityId, viewer.id)
  if (role !== 'admin') {
    return { error: 'Only community admins can edit theme.', viewer: null, status: 403 as const }
  }
  return { error: null, viewer, status: 200 as const }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params
  const g = await gate(communityId)
  if (g.error) {
    return NextResponse.json({ error: g.error }, { status: g.status })
  }
  const state = await CommunityThemeRepository.get(communityId)
  return NextResponse.json({ data: state })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params
  const g = await gate(communityId)
  if (g.error || !g.viewer) {
    return NextResponse.json({ error: g.error }, { status: g.status })
  }

  let body: unknown
  try {
    body = await request.json()
  }
  catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 400 })
  }

  const next = parsed.data

  if (next.accent !== undefined && next.accent !== null && !isSafeAccent(next.accent)) {
    return NextResponse.json({ error: 'Invalid accent color.' }, { status: 400 })
  }

  const before = await CommunityThemeRepository.get(communityId)

  // Layout preset (lives on communities table — handled separately).
  if (next.layout_preset && next.layout_preset !== before.layout_preset) {
    await CommunityThemeRepository.setLayoutPreset(communityId, next.layout_preset)
  }

  // Theme row upsert.
  const wantsThemeUpsert
    = next.accent !== undefined
      || next.surface_mode !== undefined
      || next.font_hint !== undefined
      || next.hidden_sections !== undefined
      || next.featured_market_id !== undefined

  if (wantsThemeUpsert) {
    await CommunityThemeRepository.upsert({
      community_id: communityId,
      accent: next.accent === undefined ? before.accent : next.accent,
      surface_mode: next.surface_mode ?? before.surface_mode,
      font_hint: next.font_hint ?? before.font_hint,
      hidden_sections: next.hidden_sections ?? before.hidden_sections,
      featured_market_id: next.featured_market_id === undefined ? before.featured_market_id : next.featured_market_id,
    })
  }

  const after = await CommunityThemeRepository.get(communityId)

  // Audit log for both community-admin and platform-admin changes — same
  // surface either way so we can see who flipped what.
  await recordAuditEvent({
    actor: { id: g.viewer.id, label: g.viewer.username || g.viewer.email || g.viewer.id },
    action: 'community.theme_updated',
    targetType: 'community',
    targetId: communityId,
    summary: `Theme updated (preset=${after.layout_preset})`,
    diff: { before, after },
  })

  return NextResponse.json({ data: after })
}
