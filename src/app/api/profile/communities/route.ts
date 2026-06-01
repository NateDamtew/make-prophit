import { NextResponse } from 'next/server'
import { CommunityRepository } from '@/lib/db/queries/community'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  const result = await CommunityRepository.listByUser(userId)
  return NextResponse.json(result.data ?? [])
}
