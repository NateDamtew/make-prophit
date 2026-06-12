import { NextResponse } from 'next/server'
import { MyCommunitiesRepository } from '@/lib/db/queries/my-communities'
import { UserRepository } from '@/lib/db/queries/user'

export async function GET() {
  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  try {
    const items = await MyCommunitiesRepository.listForUser(user.id)
    return NextResponse.json({ items })
  }
  catch (error) {
    console.error('My communities list error', error)
    return NextResponse.json({ error: 'Failed to load communities.' }, { status: 500 })
  }
}
