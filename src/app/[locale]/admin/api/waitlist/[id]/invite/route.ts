import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { recordAuditEvent } from '@/lib/admin-ui/audit'
import { getAdminActor } from '@/lib/admin-ui/guard'
import { WaitlistAdminRepository } from '@/lib/db/queries/waitlist-admin'

const INVITE_FROM = process.env.WAITLIST_INVITE_FROM || 'Prophit <hello@makeprophit.com>'
const APP_URL = process.env.SITE_URL || 'https://makeprophit.com'

function buildInviteHtml(firstName: string) {
  return `<p>Hey ${firstName},</p>
<p>Good news — your early access to Prophit is ready.</p>
<p>You're among the first people we're letting in. Connect your wallet and start exploring the markets you helped us build.</p>
<p><a href="${APP_URL}">Open Prophit &rarr;</a></p>
<p>See you inside,</p>
<p>The Prophit team</p>`
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAdminActor()
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const { id } = await params
  const entry = await WaitlistAdminRepository.getById(id)
  if (!entry) {
    return NextResponse.json({ error: 'Waitlist entry not found.' }, { status: 404 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email is not configured (RESEND_API_KEY missing).' }, { status: 503 })
  }

  const firstName = entry.name ? entry.name.split(' ')[0] : 'there'

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: INVITE_FROM,
      to: entry.email,
      subject: 'Your Prophit early access is ready',
      html: buildInviteHtml(firstName),
    })

    if (error) {
      console.error('Resend invite error', error)
      return NextResponse.json({ error: 'Failed to send invite email.' }, { status: 502 })
    }

    const updated = await WaitlistAdminRepository.updateStatus(id, 'invited', actor.label)
    await recordAuditEvent({
      actor,
      action: 'waitlist.invited',
      targetType: 'waitlist',
      targetId: id,
      summary: `Sent invite to ${entry.email}`,
    })

    return NextResponse.json({
      success: true,
      data: updated
        ? {
            id: updated.id,
            status: updated.status,
            invited_at: updated.invited_at ? updated.invited_at.toISOString() : null,
            invited_by: updated.invited_by,
          }
        : null,
    })
  }
  catch (error) {
    console.error('Admin waitlist invite error', error)
    return NextResponse.json({ error: 'Failed to send invite.' }, { status: 500 })
  }
}
