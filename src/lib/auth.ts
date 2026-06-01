import { createHmac } from 'node:crypto'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { createHMAC } from '@better-auth/utils/hmac'
import { getChainIdFromMessage } from '@reown/appkit-siwe'
import { betterAuth } from 'better-auth'
import { APIError, createAuthEndpoint, createAuthMiddleware } from 'better-auth/api'
import { deleteSessionCookie, setSessionCookie } from 'better-auth/cookies'
import { generateRandomString } from 'better-auth/crypto'
import { nextCookies } from 'better-auth/next-js'
import { customSession, siwe, twoFactor } from 'better-auth/plugins'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { createPublicClient, http } from 'viem'
import { isAdminWallet } from '@/lib/admin'
import { AffiliateRepository } from '@/lib/db/queries/affiliate'
import { db } from '@/lib/drizzle'
import { reownProjectId } from '@/lib/reown-project-id'
import resolveSiteUrl from '@/lib/site-url'
import { getPublicAssetUrl } from '@/lib/storage'
import { DEFAULT_THEME_SITE_NAME } from '@/lib/theme-site-identity'
import { ensureUserTradingAuthSecretFingerprint } from '@/lib/trading-auth/server'
import { sanitizeTradingAuthSettings } from '@/lib/trading-auth/utils'
import { isWalletPlaceholderEmail } from '@/lib/user-email'
import * as schema from './db/schema'

const TWO_FACTOR_COOKIE_NAME = 'two_factor'
const TRUST_DEVICE_COOKIE_NAME = 'trust_device'
const TRUST_DEVICE_COOKIE_MAX_AGE = 720 * 60 * 60
const TWO_FACTOR_PENDING_MAX_AGE = 3 * 60
const AFFILIATE_COOKIE_NAME = 'platform_affiliate'
const AFFILIATE_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const SITE_URL = resolveSiteUrl(process.env)
const siteUrlObject = new URL(SITE_URL)
const SIWE_DOMAIN = siteUrlObject.host
const SIWE_EMAIL_DOMAIN = siteUrlObject.hostname || 'kuest.com'

function parseTimestampMs(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }
  if (value instanceof Date) {
    return value.getTime()
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  const parsed = Date.parse(String(value))
  return Number.isNaN(parsed) ? null : parsed
}

function parseAffiliateCookie(rawValue: string | null) {
  if (!rawValue) {
    return null
  }
  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>
    return {
      affiliateCode: typeof parsed.affiliateCode === 'string' ? parsed.affiliateCode : undefined,
      timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : undefined,
    }
  }
  catch {
    return null
  }
}

function siweTwoFactorRedirect() {
  return {
    id: 'siwe-two-factor-redirect',
    hooks: {
      after: [
        {
          matcher(context: any) {
            return context.path === '/siwe/verify'
          },
          handler: createAuthMiddleware(async (ctx) => {
            const data = ctx.context.newSession

            if (!data?.user?.twoFactorEnabled) {
              return
            }

            const sessionToken = await ctx.getSignedCookie(
              ctx.context.authCookies.sessionToken.name,
              ctx.context.secret,
            )
            if (sessionToken) {
              const existingSession = await ctx.context.internalAdapter.findSession(sessionToken)
              if (existingSession?.session?.userId === data.user.id) {
                return
              }
            }

            const trustDeviceCookieAttrs = ctx.context.createAuthCookie(TRUST_DEVICE_COOKIE_NAME, {
              maxAge: TRUST_DEVICE_COOKIE_MAX_AGE,
            })
            const trustDeviceCookie = await ctx.getSignedCookie(trustDeviceCookieAttrs.name, ctx.context.secret)

            if (trustDeviceCookie) {
              const [token, sessionToken] = trustDeviceCookie.split('!')
              const expected = await createHMAC('SHA-256', 'base64urlnopad').sign(
                ctx.context.secret,
                `${data.user.id}!${sessionToken}`,
              )

              if (token === expected) {
                const newTrustDeviceCookie = ctx.context.createAuthCookie(TRUST_DEVICE_COOKIE_NAME, {
                  maxAge: TRUST_DEVICE_COOKIE_MAX_AGE,
                })
                const newToken = await createHMAC('SHA-256', 'base64urlnopad').sign(
                  ctx.context.secret,
                  `${data.user.id}!${data.session.token}`,
                )

                await ctx.setSignedCookie(
                  newTrustDeviceCookie.name,
                  `${newToken}!${data.session.token}`,
                  ctx.context.secret,
                  trustDeviceCookieAttrs.attributes,
                )
                return
              }
            }

            deleteSessionCookie(ctx, true)
            await ctx.context.internalAdapter.deleteSession(data.session.token)

            const twoFactorCookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME, {
              maxAge: TWO_FACTOR_PENDING_MAX_AGE,
            })
            const identifier = `2fa-${generateRandomString(20)}`

            await ctx.context.internalAdapter.createVerificationValue({
              value: data.user.id,
              identifier,
              expiresAt: new Date(Date.now() + TWO_FACTOR_PENDING_MAX_AGE * 1000),
            })

            await ctx.setSignedCookie(
              twoFactorCookie.name,
              identifier,
              ctx.context.secret,
              twoFactorCookie.attributes,
            )

            return ctx.json({ twoFactorRedirect: true })
          }),
        },
      ],
    },
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  experimental: { joins: true },
  appName: DEFAULT_THEME_SITE_NAME,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: SITE_URL,
  trustedOrigins: [
    SITE_URL,
    `https://tma.${siteUrlObject.hostname}`,
    ...(process.env.TMA_DOMAIN ? [`https://${process.env.TMA_DOMAIN}`] : []),
  ],
  advanced: {
    database: {
      generateId: false,
    },
  },
  databaseHooks: {
    user: {
      create: {
        async after(user, ctx) {
          if (!ctx) {
            return
          }

          const referral = parseAffiliateCookie(ctx.getCookie(AFFILIATE_COOKIE_NAME))
          if (!referral?.affiliateCode) {
            return
          }

          const referralTimestamp = parseTimestampMs(referral.timestamp)
          if (referralTimestamp === null) {
            return
          }

          const now = Date.now()
          if (referralTimestamp > now || now - referralTimestamp > AFFILIATE_COOKIE_MAX_AGE_MS) {
            return
          }

          try {
            const { data: affiliate } = await AffiliateRepository.getAffiliateByCode(referral.affiliateCode)
            const affiliateUserId = affiliate?.id ?? null

            if (!affiliateUserId || affiliateUserId === user.id) {
              return
            }

            await AffiliateRepository.recordReferral({
              user_id: user.id,
              affiliate_user_id: affiliateUserId,
            })
            ctx.setCookie(AFFILIATE_COOKIE_NAME, '', { path: '/', maxAge: 0 })
          }
          catch (error) {
            ctx.context.logger.error('Failed to record affiliate referral', error)
          }
        },
      },
    },
  },
  plugins: [
    {
      id: 'telegram-tma',
      endpoints: {
        verifyTmaTelegram: createAuthEndpoint(
          '/telegram/verify-tma',
          {
            method: 'POST',
            body: z.object({
              initData: z.string(),
            }),
            requireRequest: true,
          },
          async (ctx) => {
            const botToken = process.env.TELEGRAM_BOT_TOKEN
            if (!botToken) {
              throw new APIError('INTERNAL_SERVER_ERROR', {
                message: 'Telegram Bot Token is not configured on the server.',
              })
            }

            const { initData } = ctx.body as { initData: string }

            const params = new URLSearchParams(initData)
            const hash = params.get('hash')
            if (!hash) {
              throw new APIError('BAD_REQUEST', { message: 'Missing hash in initData.' })
            }

            params.delete('hash')
            const keys = Array.from(params.keys()).sort()
            const checkString = keys.map(key => `${key}=${params.get(key)}`).join('\n')

            const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
            const computedHash = createHmac('sha256', secretKey).update(checkString).digest('hex')
            const computedHashFallback = createHmac('sha256', botToken).update(checkString).digest('hex')

            if (computedHash !== hash && computedHashFallback !== hash) {
              throw new APIError('UNAUTHORIZED', { message: 'Invalid Telegram authentication signature.' })
            }

            const authDateStr = params.get('auth_date')
            if (authDateStr) {
              const authDate = Number.parseInt(authDateStr, 10)
              const now = Math.floor(Date.now() / 1000)
              if (now - authDate > 86400) {
                throw new APIError('UNAUTHORIZED', { message: 'Telegram authentication request expired.' })
              }
            }

            const userStr = params.get('user')
            if (!userStr) {
              throw new APIError('BAD_REQUEST', { message: 'Missing user object in initData.' })
            }

            let tgUser: any
            try {
              tgUser = JSON.parse(userStr)
            }
            catch {
              throw new APIError('BAD_REQUEST', { message: 'Invalid user object in initData.' })
            }

            if (!tgUser.id) {
              throw new APIError('BAD_REQUEST', { message: 'Missing user ID in initData.' })
            }

            const account = await ctx.context.internalAdapter.findAccountByProviderId(
              String(tgUser.id),
              'telegram',
            )

            let user: any = null
            if (account) {
              user = await ctx.context.internalAdapter.findUserById(account.userId)
            }

            if (!user) {
              const userEmail = `telegram_${tgUser.id}@${SIWE_EMAIL_DOMAIN}`
              const name = tgUser.username
                || [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ')
                || `Telegram User ${tgUser.id}`

              let username = tgUser.username || ''
              if (username) {
                const existing = await db
                  .select()
                  .from(schema.users)
                  .where(eq(sql`LOWER(${schema.users.username})`, username.toLowerCase()))
                  .limit(1)
                if (existing.length > 0) {
                  username = ''
                }
              }

              user = await ctx.context.internalAdapter.createUser({
                name,
                email: userEmail,
                image: tgUser.photo_url || '',
                emailVerified: true,
              })

              if (!user) {
                throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Failed to create user account.' })
              }

              // Set custom fields that better-auth's adapter doesn't handle
              await db
                .update(schema.users)
                .set({
                  address: '0x0000000000000000000000000000000000000000',
                  username: username || null,
                })
                .where(eq(schema.users.id, user.id))

              await ctx.context.internalAdapter.createAccount({
                userId: user.id,
                providerId: 'telegram',
                accountId: String(tgUser.id),
                createdAt: new Date(),
                updatedAt: new Date(),
              })
            }

            const session = await ctx.context.internalAdapter.createSession(user.id)
            if (!session) {
              throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Failed to create session.' })
            }

            await setSessionCookie(ctx as any, { session, user })

            return ctx.json({
              token: session.token,
              success: true,
              user: {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
              },
            })
          },
        ),
      },
    },
    customSession(async ({ user, session }) => {
      const userId = String((user as any).id ?? '')
      const email = isWalletPlaceholderEmail(user.email, [SIWE_EMAIL_DOMAIN]) ? '' : user.email
      const rawSettings = (user as any).settings as Record<string, any> | undefined
      const hydratedSettings = rawSettings && userId
        ? await ensureUserTradingAuthSecretFingerprint(userId, rawSettings)
        : rawSettings
      const settings = hydratedSettings
        ? sanitizeTradingAuthSettings(hydratedSettings)
        : hydratedSettings

      return {
        user: {
          ...user,
          email,
          settings,
          image: user.image ? getPublicAssetUrl(user.image) : '',
          is_admin:
            isAdminWallet(user.name)
            || isAdminWallet(user.email)
            || (typeof (user as any).username === 'string' && isAdminWallet((user as any).username)),
        },
        session,
      }
    }),
    siwe({
      schema: {
        walletAddress: {
          modelName: 'wallets',
          fields: {
            userId: 'user_id',
            address: 'address',
            chainId: 'chain_id',
            isPrimary: 'is_primary',
            createdAt: 'created_at',
          },
        },
      },
      domain: SIWE_DOMAIN,
      emailDomainName: SIWE_EMAIL_DOMAIN,
      anonymous: true,
      getNonce: async () => generateRandomString(32),
      verifyMessage: async ({ message, signature, address }) => {
        const chainId = getChainIdFromMessage(message)

        const publicClient = createPublicClient(
          {
            transport: http(
              `https://rpc.walletconnect.org/v1/?chainId=${chainId}&projectId=${reownProjectId}`,
            ),
          },
        )

        return await publicClient.verifyMessage({
          message,
          address: address as `0x${string}`,
          signature: signature as `0x${string}`,
        })
      },
    }),
    siweTwoFactorRedirect(),
    twoFactor({
      allowPasswordless: true,
      skipVerificationOnEnable: false,
      schema: {
        user: {
          fields: {
            twoFactorEnabled: 'two_factor_enabled',
          },
        },
        twoFactor: {
          modelName: 'two_factors',
          fields: {
            secret: 'secret',
            backupCodes: 'backup_codes',
            userId: 'user_id',
          },
        },
      },
    }),
    nextCookies(),
  ],
  user: {
    modelName: 'users',
    fields: {
      name: 'address',
      email: 'email',
      emailVerified: 'email_verified',
      image: 'image',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    additionalFields: {
      address: {
        type: 'string',
      },
      username: {
        type: 'string',
      },
      settings: {
        type: 'json',
      },
      deposit_wallet_address: {
        type: 'string',
      },
      deposit_wallet_signature: {
        type: 'string',
      },
      deposit_wallet_status: {
        type: 'string',
      },
      deposit_wallet_signed_at: {
        type: 'date',
      },
      deposit_wallet_tx_hash: {
        type: 'string',
      },
      affiliate_code: {
        type: 'string',
      },
      referred_by_user_id: {
        type: 'string',
      },
    },
    changeEmail: {
      enabled: true,
    },
  },
  session: {
    modelName: 'sessions',
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
    fields: {
      userId: 'user_id',
      token: 'token',
      expiresAt: 'expires_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  account: {
    modelName: 'accounts',
    fields: {
      userId: 'user_id',
      accountId: 'account_id',
      providerId: 'provider_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      idToken: 'id_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      scope: 'scope',
      password: 'password',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  verification: {
    modelName: 'verifications',
    fields: {
      identifier: 'identifier',
      value: 'value',
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
})
