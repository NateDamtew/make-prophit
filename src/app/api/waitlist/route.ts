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
        from: 'Liben <liben@makeprophit.com>',
        to: email,
        subject: 'Welcome to the Prophit waitlist.',
        html: `<p>Hey ${name ? name.split(' ')[0] : 'there'},</p>
<p>I'm Liben, the founder of Prophit. I wanted to personally thank you for joining the waitlist.</p>
<p>I built Prophit because the markets I wanted to trade didn't exist, and I got tired of waiting for global platforms to list outcomes my community actually cares about.</p>
<p>We're putting the finishing touches on our Testnet and getting ready for the big reveal. You're now on the list to be among the first to get access and help us shape the platform.</p>
<p>In the meantime, our earliest community members are hanging out in Telegram. Come say hi—I'm active in there every day.</p>
<p><a href="https://t.me/+t_ka6vpwklQ5NDg8">Join the Telegram here &rarr;</a></p>
<p>Talk soon,</p>
<p>Liben</p>`
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
