import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { CommunityRepository } from '@/lib/db/queries/community'
import { CommunityEmbedRepository } from '@/lib/db/queries/community-monetization'
import { UserRepository } from '@/lib/db/queries/user'

const themeSchema = z.object({
  mode: z.enum(['auto', 'light', 'dark']).default('auto'),
  accent: z.string().trim().max(64).optional(),
})

const patchSchema = z.object({
  theme: themeSchema.optional(),
  allowed_domains: z
    .array(z.string().trim().min(1).max(255))
    .max(100, 'Maximum 100 domains')
    .optional(),
})

async function requireCommunityAdmin(communityId: string) {
  const viewer = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!viewer) {
    return { error: 'Sign in to manage embed settings.', viewer: null, status: 401 as const }
  }
  if (viewer.is_admin) {
    return { error: null, viewer, status: 200 as const }
  }
  const { data: role } = await CommunityRepository.getMemberRole(communityId, viewer.id)
  if (role !== 'admin') {
    return { error: 'Only community admins can manage embeds.', viewer: null, status: 403 as const }
  }
  return { error: null, viewer, status: 200 as const }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params
  const gate = await requireCommunityAdmin(communityId)
  if (gate.error) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const config = await CommunityEmbedRepository.get(communityId)
  return NextResponse.json({
    data: config ?? {
      community_id: communityId,
      theme: { mode: 'auto' },
      allowed_domains: [],
    },
  })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params
  const gate = await requireCommunityAdmin(communityId)
  if (gate.error || !gate.viewer) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
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

  const existing = await CommunityEmbedRepository.get(communityId)
  const updated = await CommunityEmbedRepository.upsert({
    community_id: communityId,
    theme: parsed.data.theme ?? existing?.theme ?? { mode: 'auto' },
    allowed_domains: parsed.data.allowed_domains ?? existing?.allowed_domains ?? [],
  })

  await recordAuditEvent({
    actor: { id: gate.viewer.id, label: gate.viewer.username || gate.viewer.email || gate.viewer.id },
    action: 'community.embed_config_updated',
    targetType: 'community',
    targetId: communityId,
    summary: `Updated embed config for community ${communityId}`,
    diff: {
      before: existing,
      after: updated,
    },
  })

  return NextResponse.json({ data: updated })
}
