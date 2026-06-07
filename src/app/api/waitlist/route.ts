import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { db } from '@/lib/drizzle'
import { waitlists } from '@/lib/db/schema/waitlist/tables'
import { z } from 'zod'

const waitlistSchema = z.object({
  name: z.string().optional(),
  email: z.string().email('Invalid email address'),
  role: z.string().optional(),
  country: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const result = waitlistSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 })
    }

    const { name, email, role, country } = result.data

    await db.insert(waitlists).values({ name, email, role, country }).onConflictDoNothing({ target: waitlists.email })

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Prophit <hello@makeprophit.com>',
        to: email,
        subject: 'Welcome to the Prophit Waitlist \uD83C\uDF0D',
        html: `<p>Hi ${name || 'there'},</p><p>You're on the list! We'll reach out as soon as mainnet launches.</p><p>In the meantime, join our <a href="https://t.me/prophit">Telegram</a> to get access to the testnet.</p><p>— The Prophit Team</p>`
      })

      // Note: To add to a Resend Audience (contacts), you'll need your Audience ID from the Resend dashboard.
      if (process.env.RESEND_AUDIENCE_ID) {
        await resend.contacts.create({
          email: email,
          firstName: name || '',
          audienceId: process.env.RESEND_AUDIENCE_ID,
        })
      }
    }

    return NextResponse.json({ success: true, message: 'Added to waitlist!' }, { status: 201 })
  } catch (error) {
    console.error('Waitlist API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
