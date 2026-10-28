import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import { getAdminWallets, isAdminWallet } from '@/lib/admin'

import { hoisted, stubEnv, unstubAllEnvs } from '../bun-test-helpers'

const mocks = hoisted(() => ({
  limit: mock(),
}))

void mock.module('@/lib/drizzle', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: mocks.limit }),
      }),
    }),
  },
}))

const ADMIN_WALLET = '0x00000000000000000000000000000000000000aa'

describe('platform admin wallets', () => {
  afterEach(() => {
    unstubAllEnvs()
  })

  it('matches only ADMIN_WALLETS addresses, case-insensitively', () => {
    stubEnv('ADMIN_WALLETS', `0x00000000000000000000000000000000000000AA, 0x00000000000000000000000000000000000000bb`)

    expect(isAdminWallet(ADMIN_WALLET)).toBe(true)
    expect(isAdminWallet(` ${ADMIN_WALLET} `)).toBe(true)
    expect(isAdminWallet('0x00000000000000000000000000000000000000cc')).toBe(false)
    expect(isAdminWallet(null)).toBe(false)
  })

  it('never treats an email or a username as an admin', () => {
    stubEnv('ADMIN_WALLETS', ADMIN_WALLET)
    stubEnv('ADMIN_EMAILS', 'nathandamtew@gmail.com')

    expect(isAdminWallet('nathandamtew@gmail.com')).toBe(false)
    expect(isAdminWallet('natedamtew')).toBe(false)
  })

  it('reads a JSON array of wallets', () => {
    stubEnv('ADMIN_WALLETS', JSON.stringify([ADMIN_WALLET]))

    expect(getAdminWallets()).toEqual([ADMIN_WALLET])
  })

  it('has no admins when ADMIN_WALLETS is unset', () => {
    stubEnv('ADMIN_WALLETS', '')

    expect(getAdminWallets()).toEqual([])
    expect(isAdminWallet(ADMIN_WALLET)).toBe(false)
  })
})

describe('isAdminUser', () => {
  beforeEach(() => {
    mocks.limit.mockReset()
  })

  afterEach(() => {
    unstubAllEnvs()
  })

  it('is false without a user or without ADMIN_WALLETS, and skips the query', async () => {
    const { isAdminUser } = await import('@/lib/admin-users')

    stubEnv('ADMIN_WALLETS', ADMIN_WALLET)
    expect(await isAdminUser('')).toBe(false)
    stubEnv('ADMIN_WALLETS', '')
    expect(await isAdminUser('user-1')).toBe(false)
    expect(mocks.limit).not.toHaveBeenCalled()
  })

  it('follows whether the user has an admin wallet linked through SIWE', async () => {
    const { isAdminUser } = await import('@/lib/admin-users')
    stubEnv('ADMIN_WALLETS', ADMIN_WALLET)

    mocks.limit.mockResolvedValueOnce([{ id: 'wallet-1' }])
    expect(await isAdminUser('admin-user')).toBe(true)

    mocks.limit.mockResolvedValueOnce([])
    expect(await isAdminUser('other-user')).toBe(false)
  })
})
