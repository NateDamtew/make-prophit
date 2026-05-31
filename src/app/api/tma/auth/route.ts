import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
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

    const telegramId = String(data.user.id)
    const displayName = [data.user.first_name, data.user.last_name].filter(Boolean).join(' ')
    const email = `tg_${telegramId}@telegram.kuest.com`

    const ctx = await auth.$context
    const existingUser = await ctx.internalAdapter.findUserByEmail(email)

    let userId: string
    if (existingUser?.user) {
      userId = existingUser.user.id
    }
    else {
      const created = await ctx.internalAdapter.createUser({
        name: displayName,
        email,
        emailVerified: false,
        image: data.user.photo_url ?? '',
      })
      if (!created) {
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
      }
      userId = created.id

      await ctx.internalAdapter.linkAccount({
        userId,
        accountId: telegramId,
        providerId: 'telegram',
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scope: null,
        password: null,
      })
    }

    const session = await ctx.internalAdapter.createSession(userId)
    if (!session) {
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
    }

    const cookieStore = await cookies()
    const isProduction = process.env.NODE_ENV === 'production'
    const cookieName = isProduction ? '__Secure-better-auth.session_token' : 'better-auth.session_token'

    cookieStore.set({
      name: cookieName,
      value: session.token,
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
      expires: session.expiresAt,
    })

    return NextResponse.json({
      user: {
        id: userId,
        name: displayName,
        telegramId: data.user.id,
        username: data.user.username,
      },
    })
  }
  catch (error) {
    console.error('TMA auth failed:', error)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
