import { NextResponse } from 'next/server'
import { validateTelegramInitData } from '@/lib/tma/validate'

export async function POST(request: Request) {
  try {
    const { initData } = await request.json()
    if (!initData || typeof initData !== 'string') {
      return NextResponse.json({ error: 'Missing initData' }, { status: 400 })
    }

    const data = await validateTelegramInitData(initData)
    if (!data) {
      return NextResponse.json({ error: 'Invalid or expired initData' }, { status: 401 })
    }

    return NextResponse.json({ user: data.user })
  }
  catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
}
