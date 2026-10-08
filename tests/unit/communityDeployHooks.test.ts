import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { hoisted } from '../bun-test-helpers'

const mocks = hoisted(() => ({
  setDeployStatus: mock(),
  notifyDeployed: mock(),
  notifyDeployFailed: mock(),
  notifySuperAdmins: mock(),
  dbSelectEvent: mock(),
  dbSelectMarkets: mock(),
  dbSelectMarketWithCommunity: mock(),
  dbSelectMarketStatus: mock(),
  dbUpdateEvents: mock(),
  dbUpdateConditions: mock(),
}))

void mock.module('@/lib/drizzle', () => ({
  db: {
    select: () => ({
      from: (_table: any) => ({
        where: () => ({
          limit: () => {
            const handler =
              mocks.dbSelectEvent.getMockImplementation() ?? mocks.dbSelectMarketWithCommunity.getMockImplementation()
            return handler ? handler() : []
          },
          innerJoin: () => ({
            where: () => ({
              limit: () => mocks.dbSelectMarketWithCommunity(),
            }),
          }),
        }),
        innerJoin: () => ({
          where: () => ({
            limit: () => mocks.dbSelectMarketWithCommunity(),
          }),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => mocks.dbUpdateEvents(),
      }),
    }),
  },
}))

void mock.module('@/lib/db/schema/communities/tables', () => ({
  communities: { id: 'communities.id', slug: 'communities.slug', name: 'communities.name' },
  community_markets: {
    id: 'cm.id',
    review_status: 'cm.review_status',
    created_by: 'cm.created_by',
    title: 'cm.title',
    community_id: 'cm.community_id',
  },
}))

void mock.module('@/lib/db/schema/events/tables', () => ({
  events: { id: 'events.id', slug: 'events.slug' },
  conditions: { id: 'conditions.id' },
  markets: { event_id: 'markets.event_id', condition_id: 'markets.condition_id' },
}))

void mock.module('@/lib/db/queries/community', () => ({
  CommunityRepository: {
    setDeployStatus: mocks.setDeployStatus,
  },
}))

void mock.module('@/lib/community-notifications', () => ({
  notifyMarketDeployed: mocks.notifyDeployed,
  notifyMarketDeployFailed: mocks.notifyDeployFailed,
  notifySuperAdminsOfDeployFailure: mocks.notifySuperAdmins,
}))

describe('onCommunityDraftDeploying', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset())
  })

  it('does nothing when draft has no communityMarketId hint', async () => {
    const { onCommunityDraftDeploying } = await import('@/lib/community-deploy-hooks')
    await onCommunityDraftDeploying({})
    expect(mocks.setDeployStatus).not.toHaveBeenCalled()
  })

  it('does nothing when draftPayload is null/invalid', async () => {
    const { onCommunityDraftDeploying } = await import('@/lib/community-deploy-hooks')
    await onCommunityDraftDeploying(null)
    await onCommunityDraftDeploying('string')
    await onCommunityDraftDeploying(undefined)
    expect(mocks.setDeployStatus).not.toHaveBeenCalled()
  })
})

describe('onCommunityDraftFailed', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset())
  })

  it('does nothing for non-community drafts', async () => {
    const { onCommunityDraftFailed } = await import('@/lib/community-deploy-hooks')
    await onCommunityDraftFailed({
      draftPayload: {},
      error: 'gas',
      attemptsBefore: 0,
      exhausted: false,
    })
    expect(mocks.setDeployStatus).not.toHaveBeenCalled()
  })

  it('marks first failure as deploy_retry (not final)', async () => {
    mocks.dbSelectMarketWithCommunity.mockResolvedValue([])
    const { onCommunityDraftFailed } = await import('@/lib/community-deploy-hooks')
    await onCommunityDraftFailed({
      draftPayload: { communityMarketId: 'M1', communityId: 'C1' },
      error: 'gas estimation failed',
      attemptsBefore: 0,
      exhausted: false,
    })

    expect(mocks.setDeployStatus).toHaveBeenCalledWith({
      marketId: 'M1',
      status: 'deploy_retry',
      error: 'gas estimation failed',
      incrementAttempts: true,
    })
    // First failure → no escalation
    expect(mocks.notifyDeployFailed).not.toHaveBeenCalled()
    expect(mocks.notifySuperAdmins).not.toHaveBeenCalled()
  })

  it('marks second failure as deploy_failed and notifies', async () => {
    mocks.dbSelectMarketWithCommunity.mockResolvedValue([
      {
        created_by: 'admin-u1',
        title: 'Will X?',
        community_slug: 'ethiopian-traders',
        community_name: 'Ethiopian Traders',
      },
    ])
    const { onCommunityDraftFailed } = await import('@/lib/community-deploy-hooks')
    await onCommunityDraftFailed({
      draftPayload: { communityMarketId: 'M1', communityId: 'C1' },
      error: 'contract reverted',
      attemptsBefore: 1, // second attempt failing
      exhausted: false,
    })

    expect(mocks.setDeployStatus).toHaveBeenCalledWith({
      marketId: 'M1',
      status: 'deploy_failed',
      error: 'contract reverted',
      incrementAttempts: true,
    })
    expect(mocks.notifyDeployFailed).toHaveBeenCalledWith({
      communityAdminId: 'admin-u1',
      communitySlug: 'ethiopian-traders',
      marketTitle: 'Will X?',
    })
    expect(mocks.notifySuperAdmins).toHaveBeenCalledWith({
      marketTitle: 'Will X?',
      communityName: 'Ethiopian Traders',
      error: 'contract reverted',
    })
  })

  it('escalates immediately if exhausted regardless of attempt count', async () => {
    mocks.dbSelectMarketWithCommunity.mockResolvedValue([
      {
        created_by: 'admin-u1',
        title: 'Will X?',
        community_slug: 'slug',
        community_name: 'Name',
      },
    ])
    const { onCommunityDraftFailed } = await import('@/lib/community-deploy-hooks')
    await onCommunityDraftFailed({
      draftPayload: { communityMarketId: 'M1', communityId: 'C1' },
      error: 'fatal',
      attemptsBefore: 0,
      exhausted: true,
    })
    expect(mocks.setDeployStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'deploy_failed',
      }),
    )
    expect(mocks.notifyDeployFailed).toHaveBeenCalled()
  })
})
