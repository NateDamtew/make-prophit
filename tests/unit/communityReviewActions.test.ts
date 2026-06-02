import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getMemberRole: vi.fn(),
  submitForReview: vi.fn(),
  setReviewApproved: vi.fn(),
  setReviewRejected: vi.fn(),
  retryDeploy: vi.fn(),
  createDraft: vi.fn(),
  setExecutionState: vi.fn(),
  loadSigners: vi.fn(),
  notifySubmitted: vi.fn(),
  notifyApproved: vi.fn(),
  notifyRejected: vi.fn(),
  dbSelect: vi.fn(),
}))

vi.mock('@/lib/db/queries/user', () => ({
  UserRepository: { getCurrentUser: mocks.getCurrentUser },
}))

vi.mock('@/lib/db/queries/community', () => ({
  CommunityRepository: {
    getMemberRole: mocks.getMemberRole,
    submitForReview: mocks.submitForReview,
    setReviewApproved: mocks.setReviewApproved,
    setReviewRejected: mocks.setReviewRejected,
    retryDeploy: mocks.retryDeploy,
  },
}))

vi.mock('@/lib/db/queries/event-creations', () => ({
  EventCreationRepository: {
    createDraft: mocks.createDraft,
    setExecutionState: mocks.setExecutionState,
  },
}))

vi.mock('@/lib/event-creation-signers', () => ({
  loadEventCreationSignersFromEnv: mocks.loadSigners,
}))

vi.mock('@/lib/community-notifications', () => ({
  notifyMarketSubmitted: mocks.notifySubmitted,
  notifyMarketApproved: mocks.notifyApproved,
  notifyMarketRejected: mocks.notifyRejected,
}))

vi.mock('@/lib/db/schema/communities/tables', () => ({
  community_markets: { id: 'cm.id' },
}))

vi.mock('@/lib/drizzle', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mocks.dbSelect(),
        }),
      }),
    }),
  },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('submitMarketForReviewAction', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
  })

  it('rejects non-community-admin users', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'member', error: null })
    const { submitMarketForReviewAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/review-actions')
    const result = await submitMarketForReviewAction('M1', 'C1', 'slug', {
      mainCategorySlug: 'politics',
      categorySlugs: ['a', 'b', 'c', 'd'],
    })
    expect(result.error).toMatch(/community owner/i)
  })

  it('surfaces missing sub-categories error from repository', async () => {
    // Categories are now validated in CommunityRepository.submitForReview
    // (since they're set during the 5-step wizard, not the submit dialog)
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'admin', error: null })
    mocks.submitForReview.mockResolvedValue({
      data: null,
      error: 'At least 4 sub-categories required.',
    })
    const { submitMarketForReviewAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/review-actions')
    const result = await submitMarketForReviewAction('M1', 'C1', 'slug', {
      mainCategorySlug: 'politics',
      categorySlugs: ['a', 'b', 'c'],
    })
    expect(result.error).toMatch(/4 sub-categories/i)
  })

  it('surfaces missing main category error from repository', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'admin', error: null })
    mocks.submitForReview.mockResolvedValue({
      data: null,
      error: 'Main category is required. Add one before submitting.',
    })
    const { submitMarketForReviewAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/review-actions')
    const result = await submitMarketForReviewAction('M1', 'C1', 'slug', {
      mainCategorySlug: '',
      categorySlugs: ['a', 'b', 'c', 'd'],
    })
    expect(result.error).toMatch(/main category/i)
  })

  it('submits + fires notification on success', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'admin', error: null })
    mocks.submitForReview.mockResolvedValue({
      data: { id: 'M1', title: 'Test market', created_by: 'u1' },
      error: null,
    })
    const { submitMarketForReviewAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/review-actions')
    const result = await submitMarketForReviewAction('M1', 'C1', 'slug', {
      mainCategorySlug: 'politics',
      categorySlugs: ['a', 'b', 'c', 'd'],
    })
    expect(result.error).toBeNull()
    expect(mocks.notifySubmitted).toHaveBeenCalledWith({
      communityAdminId: 'u1',
      communitySlug: 'slug',
      marketTitle: 'Test market',
    })
  })
})

describe('rejectMarketAction', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
  })

  it('rejects non-platform-admins', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1', is_admin: false })
    const { rejectMarketAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/review-actions')
    const result = await rejectMarketAction('M1', 'slug', 'unclear')
    expect(result.error).toMatch(/platform admins/i)
  })

  it('requires non-empty feedback', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'admin', is_admin: true })
    const { rejectMarketAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/review-actions')
    const result = await rejectMarketAction('M1', 'slug', '   ')
    expect(result.error).toMatch(/feedback is required/i)
  })

  it('rejects with feedback and notifies community admin', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'admin', is_admin: true })
    mocks.setReviewRejected.mockResolvedValue({
      data: { id: 'M1', title: 'Bad market', created_by: 'u1' },
      error: null,
    })
    const { rejectMarketAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/review-actions')
    const result = await rejectMarketAction('M1', 'slug', 'Resolution source is unclear.')
    expect(result.error).toBeNull()
    expect(mocks.notifyRejected).toHaveBeenCalledWith({
      communityAdminId: 'u1',
      communitySlug: 'slug',
      marketTitle: 'Bad market',
      feedback: 'Resolution source is unclear.',
    })
  })
})

describe('approveMarketAction', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
  })

  it('rejects non-platform-admins', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1', is_admin: false })
    const { approveMarketAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/review-actions')
    const result = await approveMarketAction('M1', 'slug')
    expect(result.error).toMatch(/platform admins/i)
  })

  it('rejects markets not in pending status', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'admin', is_admin: true })
    mocks.dbSelect.mockResolvedValue([{
      id: 'M1',
      review_status: 'draft',
      title: 'X',
      main_category_slug: 'politics',
      category_slugs: ['a', 'b', 'c', 'd'],
      resolution_date: new Date('2026-12-31'),
    }])
    const { approveMarketAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/review-actions')
    const result = await approveMarketAction('M1', 'slug')
    expect(result.error).toMatch(/pending/i)
  })

  it('rejects markets missing required categories', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'admin', is_admin: true })
    mocks.dbSelect.mockResolvedValue([{
      id: 'M1',
      review_status: 'pending',
      title: 'X',
      main_category_slug: null,
      category_slugs: [],
      resolution_date: new Date('2026-12-31'),
    }])
    const { approveMarketAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/review-actions')
    const result = await approveMarketAction('M1', 'slug')
    expect(result.error).toMatch(/categories/i)
  })

  it('rejects when no signers configured', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'admin', is_admin: true })
    mocks.dbSelect.mockResolvedValue([{
      id: 'M1',
      review_status: 'pending',
      title: 'X',
      main_category_slug: 'politics',
      category_slugs: ['a', 'b', 'c', 'd'],
      resolution_date: new Date('2026-12-31'),
      resolution_rules: 'rules',
    }])
    mocks.loadSigners.mockReturnValue([])
    const { approveMarketAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/review-actions')
    const result = await approveMarketAction('M1', 'slug')
    expect(result.error).toMatch(/wallets|infrastructure/i)
  })

  it('rejects when no resolution date set', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'admin', is_admin: true })
    mocks.dbSelect.mockResolvedValue([{
      id: 'M1',
      review_status: 'pending',
      title: 'X',
      main_category_slug: 'politics',
      category_slugs: ['a', 'b', 'c', 'd'],
      resolution_date: null,
      resolution_rules: 'rules',
    }])
    mocks.loadSigners.mockReturnValue([{ address: '0xabc', privateKey: '0x123' }])
    const { approveMarketAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/review-actions')
    const result = await approveMarketAction('M1', 'slug')
    expect(result.error).toMatch(/resolution date/i)
  })

  it('creates event_creations draft and notifies on success', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'admin', is_admin: true })
    mocks.dbSelect.mockResolvedValue([{
      id: 'M1',
      community_id: 'C1',
      review_status: 'pending',
      title: 'Will X happen?',
      description: 'd',
      main_category_slug: 'politics',
      category_slugs: ['a', 'b', 'c', 'd'],
      resolution_date: new Date('2026-12-31T00:00:00Z'),
      resolution_source: 'source',
      resolution_rules: 'precise rules here that meet minimum length',
      created_by: 'communityAdmin1',
    }])
    mocks.loadSigners.mockReturnValue([{ address: '0xabc', privateKey: '0x123' }])
    mocks.createDraft.mockResolvedValue({ data: { id: 'DRAFT1' }, error: null })
    mocks.setReviewApproved.mockResolvedValue({ data: { id: 'M1' }, error: null })
    mocks.setExecutionState.mockResolvedValue({ data: true, error: null })

    const { approveMarketAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/review-actions')
    const result = await approveMarketAction('M1', 'slug')

    expect(result.error).toBeNull()
    expect(mocks.createDraft).toHaveBeenCalled()
    const draftCall = mocks.createDraft.mock.calls[0][0]
    expect(draftCall.draftPayload.communityMarketId).toBe('M1')
    expect(draftCall.draftPayload.communityId).toBe('C1')
    expect(draftCall.draftPayload.form.mainCategorySlug).toBe('politics')

    expect(mocks.setExecutionState).toHaveBeenCalledWith({
      draftId: 'DRAFT1',
      status: 'scheduled',
      lastError: null,
    })

    expect(mocks.notifyApproved).toHaveBeenCalledWith({
      communityAdminId: 'communityAdmin1',
      communitySlug: 'slug',
      marketTitle: 'Will X happen?',
    })
  })
})

describe('retryDeployAction', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
  })

  it('rejects non-admins', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1', is_admin: false })
    const { retryDeployAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/review-actions')
    const result = await retryDeployAction('M1', 'slug')
    expect(result.error).toMatch(/platform admins/i)
  })

  it('retries deploy for admin', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'admin', is_admin: true })
    mocks.retryDeploy.mockResolvedValue({ data: { id: 'M1' }, error: null })
    const { retryDeployAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/review-actions')
    const result = await retryDeployAction('M1', 'slug')
    expect(result.error).toBeNull()
    expect(mocks.retryDeploy).toHaveBeenCalledWith('M1')
  })
})
