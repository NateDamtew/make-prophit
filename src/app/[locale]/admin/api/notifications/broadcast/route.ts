import type { NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { db } from '@/lib/drizzle'

const broadcastSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  description: z.string().trim().min(1, 'Message is required').max(1000),
  linkUrl: z.string().trim().url('Must be a valid URL').max(500).optional().or(z.literal('')),
  linkLabel: z.string().trim().max(60).optional(),
})

export async function POST(request: NextRequest) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  }
  catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const parsed = broadcastSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 400 })
  }

  const { title, description, linkUrl, linkLabel } = parsed.data
  const hasLink = !!linkUrl

  try {
    // One row per user via insert-from-select — efficient even for large bases.
    const result = await db.execute(sql`
      INSERT INTO notifications (user_id, category, title, description, link_type, link_url, link_label)
      SELECT id, 'announcement', ${title}, ${description},
             ${hasLink ? 'external' : 'none'},
             ${hasLink ? linkUrl : null},
             ${hasLink ? (linkLabel || 'Learn more') : null}
      FROM users
    `)

    const recipientCount = (result as unknown as { count?: number })?.count ?? null

    await recordAuditEvent({
      actor,
      action: 'notification.broadcast',
      targetType: 'notification',
      summary: `Broadcast "${title}" to all users`,
      diff: { title, hasLink },
    })

    return NextResponse.json({ success: true, recipientCount })
  }
  catch (error) {
    console.error('Admin notification broadcast error', error)
    return NextResponse.json({ error: 'Failed to send broadcast.' }, { status: 500 })
  }
}
