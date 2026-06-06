import { NextResponse } from 'next/server'
import { db } from '@/lib/drizzle'
import { waitlists } from '@/lib/db/schema/waitlist/tables'
import { z } from 'zod'

const waitlistSchema = z.object({
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

    const { email, role, country } = result.data

    await db.insert(waitlists).values({ email, role, country }).onConflictDoNothing({ target: waitlists.email })

    return NextResponse.json({ success: true, message: 'Added to waitlist!' }, { status: 201 })
  } catch (error) {
    console.error('Waitlist API Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
