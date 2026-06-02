import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  dbInsertValues: vi.fn(),
  dbSelectFromWhere: vi.fn(),
  getAdminIdentifierLists: vi.fn(),
}))

vi.mock('@/lib/drizzle', () => ({
  db: {
    insert: () => ({ values: mocks.dbInsertValues }),
    select: () => ({
      from: () => ({
        where: () => mocks.dbSelectFromWhere(),
      }),
    }),
  },
}))

vi.mock('@/lib/db/schema/notifications/tables', () => ({
  notifications: {},
}))

vi.mock('@/lib/db/schema/auth/tables', () => ({
  users: { id: 'users.id', email: 'users.email', address: 'users.address', username: 'users.username' },
}))

vi.mock('@/lib/admin', () => ({
  getAdminIdentifierLists: mocks.getAdminIdentifierLists,
}))

describe('community-notifications: individual notifications', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
    mocks.dbInsertValues.mockResolvedValue(undefined)
  })

  it('notifyMarketSubmitted writes a notification with correct fields', async () => {
    const { notifyMarketSubmitted } = await import('@/lib/community-notifications')
    await notifyMarketSubmitted({
      communityAdminId: 'u1',
      communitySlug: 'ethiopian-traders',
      marketTitle: 'Will GDP grow?',
    })
    expect(mocks.dbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u1',
      category: 'community_market_review',
      title: 'Market submitted for review',
      link_target: 'ethiopian-traders',
    }))
  })

  it('notifyMarketRejected includes feedback in extra_info', async () => {
    const { notifyMarketRejected } = await import('@/lib/community-notifications')
    await notifyMarketRejected({
      communityAdminId: 'u1',
      communitySlug: 'slug',
      marketTitle: 'X',
      feedback: 'Source unclear',
    })
    expect(mocks.dbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      extra_info: 'Source unclear',
      title: 'Market needs revision',
    }))
  })

  it('notifyMarketDeployed links to the event slug', async () => {
    const { notifyMarketDeployed } = await import('@/lib/community-notifications')
    await notifyMarketDeployed({
      communityAdminId: 'u1',
      communitySlug: 'slug',
      marketTitle: 'X',
      eventSlug: 'will-x-happen',
    })
    expect(mocks.dbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      link_url: '/event/will-x-happen',
      link_type: 'community_market',
    }))
  })

  it('notifyMarketResolved uses the right outcome label', async () => {
    const { notifyMarketResolved } = await import('@/lib/community-notifications')
    await notifyMarketResolved({
      communityAdminId: 'u1',
      communitySlug: 'slug',
      marketTitle: 'X',
      outcome: 'yes',
    })
    expect(mocks.dbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Market resolved: YES',
    }))

    mocks.dbInsertValues.mockReset()
    await notifyMarketResolved({
      communityAdminId: 'u1',
      communitySlug: 'slug',
      marketTitle: 'X',
      outcome: 'cancelled',
    })
    expect(mocks.dbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Market resolved: Cancelled',
    }))
  })

  it('notification creation swallows DB errors silently (best-effort)', async () => {
    mocks.dbInsertValues.mockRejectedValue(new Error('connection lost'))
    const { notifyMarketApproved } = await import('@/lib/community-notifications')
    // Should not throw
    await expect(notifyMarketApproved({
      communityAdminId: 'u1',
      communitySlug: 'slug',
      marketTitle: 'X',
    })).resolves.toBeUndefined()
  })
})

describe('community-notifications: super admin escalation', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
    mocks.dbInsertValues.mockResolvedValue(undefined)
  })

  it('does nothing when no admin identifiers configured', async () => {
    mocks.getAdminIdentifierLists.mockReturnValue({
      wallets: [], emails: [], usernames: [],
    })
    const { notifySuperAdminsOfDeployFailure } = await import('@/lib/community-notifications')
    await notifySuperAdminsOfDeployFailure({
      marketTitle: 'X',
      communityName: 'Y',
      error: 'gas',
    })
    expect(mocks.dbInsertValues).not.toHaveBeenCalled()
  })

  it('notifies all matched admin users on deploy failure', async () => {
    mocks.getAdminIdentifierLists.mockReturnValue({
      wallets: [],
      emails: ['admin@example.com'],
      usernames: ['superadmin'],
    })
    mocks.dbSelectFromWhere.mockResolvedValue([
      { id: 'admin-1' },
      { id: 'admin-2' },
    ])

    const { notifySuperAdminsOfDeployFailure } = await import('@/lib/community-notifications')
    await notifySuperAdminsOfDeployFailure({
      marketTitle: 'Crypto Market',
      communityName: 'Degens',
      error: 'gas estimation failed',
    })

    expect(mocks.dbInsertValues).toHaveBeenCalledTimes(2)
    expect(mocks.dbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'admin-1',
      category: 'community_market_deploy_failure_admin',
      extra_info: 'gas estimation failed',
    }))
  })
})
