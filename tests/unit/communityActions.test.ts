import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getBySlug: vi.fn(),
  getById: vi.fn(),
  getMemberRole: vi.fn(),
  create: vi.fn(),
  join: vi.fn(),
  leave: vi.fn(),
  addReview: vi.fn(),
  castVote: vi.fn(),
  resolveMarket: vi.fn(),
  setMemberRole: vi.fn(),
  createInvite: vi.fn(),
  redeemInvite: vi.fn(),
  getMarket: vi.fn(),
}))

vi.mock('@/lib/db/queries/user', () => ({
  UserRepository: {
    getCurrentUser: mocks.getCurrentUser,
  },
}))

vi.mock('@/lib/db/queries/community', () => ({
  CommunityRepository: {
    getBySlug: mocks.getBySlug,
    getById: mocks.getById,
    getMemberRole: mocks.getMemberRole,
    create: mocks.create,
    join: mocks.join,
    leave: mocks.leave,
    addReview: mocks.addReview,
    castVote: mocks.castVote,
    resolveMarket: mocks.resolveMarket,
    setMemberRole: mocks.setMemberRole,
    createInvite: mocks.createInvite,
    redeemInvite: mocks.redeemInvite,
    getMarket: mocks.getMarket,
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('createCommunityAction', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
  })

  it('rejects unauthenticated users', async () => {
    mocks.getCurrentUser.mockResolvedValue(null)
    const { createCommunityAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await createCommunityAction({
      name: 'Test',
      slug: 'test',
      type: 'public',
      jury_size: 1,
    })
    expect(result.error).toBe('Unauthenticated.')
    expect(result.data).toBeNull()
  })

  it('rejects names shorter than 3 chars', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    const { createCommunityAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await createCommunityAction({
      name: 'ab',
      slug: 'ab',
      type: 'public',
      jury_size: 1,
    })
    expect(result.error).toMatch(/at least 3 characters/i)
  })

  it('rejects invalid slug format', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    const { createCommunityAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await createCommunityAction({
      name: 'Valid Name',
      slug: 'Invalid Slug With Spaces',
      type: 'public',
      jury_size: 1,
    })
    expect(result.error).toMatch(/lowercase|hyphens/i)
  })

  it('rejects jury_size outside 1-10', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    const { createCommunityAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const r1 = await createCommunityAction({
      name: 'Valid', slug: 'valid', type: 'public', jury_size: 0,
    })
    const r2 = await createCommunityAction({
      name: 'Valid', slug: 'valid', type: 'public', jury_size: 11,
    })
    expect(r1.error).toBeTruthy()
    expect(r2.error).toBeTruthy()
  })

  it('rejects duplicate slugs', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getBySlug.mockResolvedValue({ data: { id: 'existing' }, error: null })
    const { createCommunityAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await createCommunityAction({
      name: 'Valid', slug: 'taken', type: 'public', jury_size: 1,
    })
    expect(result.error).toMatch(/already taken/i)
  })

  it('creates community successfully with valid input', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getBySlug.mockResolvedValue({ data: null, error: null })
    mocks.create.mockResolvedValue({ data: { id: 'C1', slug: 'valid' }, error: null })
    const { createCommunityAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await createCommunityAction({
      name: 'Valid Name', slug: 'valid', type: 'public', jury_size: 3, rules: 'Be nice',
    })
    expect(result.error).toBeNull()
    expect(result.data?.id).toBe('C1')
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      creator_id: 'u1',
      name: 'Valid Name',
      slug: 'valid',
    }))
  })
})

describe('joinCommunityAction', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
  })

  it('rejects unauthenticated users', async () => {
    mocks.getCurrentUser.mockResolvedValue(null)
    const { joinCommunityAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await joinCommunityAction('C1')
    expect(result.error).toBe('Unauthenticated.')
  })

  it('joins without invite code for public communities', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.join.mockResolvedValue({ data: { user_id: 'u1' }, error: null })
    const { joinCommunityAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await joinCommunityAction('C1')
    expect(result.error).toBeNull()
    expect(mocks.join).toHaveBeenCalledWith('C1', 'u1', undefined)
  })

  it('uses invite code if provided', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.redeemInvite.mockResolvedValue({ data: { created_by: 'admin1' }, error: null })
    mocks.join.mockResolvedValue({ data: { user_id: 'u1' }, error: null })
    const { joinCommunityAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await joinCommunityAction('C1', 'CODE123')
    expect(result.error).toBeNull()
    expect(mocks.redeemInvite).toHaveBeenCalledWith('CODE123')
    expect(mocks.join).toHaveBeenCalledWith('C1', 'u1', 'admin1')
  })

  it('rejects expired/invalid invite codes', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.redeemInvite.mockResolvedValue({ data: null, error: 'Invite expired' })
    const { joinCommunityAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await joinCommunityAction('C1', 'EXPIRED')
    expect(result.error).toMatch(/expired/i)
  })
})

describe('submitReviewAction', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
  })

  it('rejects non-members', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: null, error: null })
    const { submitReviewAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await submitReviewAction('C1', 'slug', { rating: 5 })
    expect(result.error).toMatch(/must be a member/i)
  })

  it('rejects ratings outside 1-5', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'member', error: null })
    const { submitReviewAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const r1 = await submitReviewAction('C1', 'slug', { rating: 0 })
    const r2 = await submitReviewAction('C1', 'slug', { rating: 6 })
    expect(r1.error).toBeTruthy()
    expect(r2.error).toBeTruthy()
  })

  it('accepts valid review from a member', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'member', error: null })
    mocks.addReview.mockResolvedValue({ data: { id: 'R1', rating: 4 }, error: null })
    const { submitReviewAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await submitReviewAction('C1', 'slug', { rating: 4, review_text: 'Great' })
    expect(result.error).toBeNull()
    expect(mocks.addReview).toHaveBeenCalledWith('C1', 'u1', 4, 'Great')
  })
})

describe('castJuryVoteAction', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
  })

  it('rejects non-jurors', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'member', error: null })
    const { castJuryVoteAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await castJuryVoteAction('M1', 'C1', 'slug', {
      vote: 'yes',
      reasoning: 'Strong evidence',
    })
    expect(result.error).toMatch(/jury members/i)
  })

  it('allows jurors to vote', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'juror', error: null })
    mocks.castVote.mockResolvedValue({ data: { id: 'V1' }, error: null })
    mocks.getById.mockResolvedValue({ data: { jury_size: 3 }, error: null })
    mocks.resolveMarket.mockResolvedValue({ outcome: null, status: 'pending', voteCount: 1, threshold: 3 })
    const { castJuryVoteAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await castJuryVoteAction('M1', 'C1', 'slug', {
      vote: 'yes',
      reasoning: 'Resolution source confirms YES',
    })
    expect(result.error).toBeNull()
  })

  it('also allows admins to vote', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'admin', error: null })
    mocks.castVote.mockResolvedValue({ data: { id: 'V1' }, error: null })
    mocks.getById.mockResolvedValue({ data: { jury_size: 1 }, error: null })
    mocks.resolveMarket.mockResolvedValue({ outcome: 'yes', status: 'resolved', voteCount: 1, threshold: 1 })
    mocks.getMarket.mockResolvedValue({ data: { title: 'Test Market' }, error: null })
    const { castJuryVoteAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await castJuryVoteAction('M1', 'C1', 'slug', {
      vote: 'no',
      reasoning: 'Data shows otherwise',
    })
    expect(result.error).toBeNull()
  })

  it('rejects too-short reasoning', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'juror', error: null })
    const { castJuryVoteAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await castJuryVoteAction('M1', 'C1', 'slug', {
      vote: 'yes',
      reasoning: 'short',
    })
    expect(result.error).toMatch(/10 characters/i)
  })

  it('rejects invalid vote values', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'juror', error: null })
    const { castJuryVoteAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await castJuryVoteAction('M1', 'C1', 'slug', {
      vote: 'maybe' as any,
      reasoning: 'Long enough reasoning text here',
    })
    expect(result.error).toBeTruthy()
  })
})

describe('setMemberRoleAction', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
  })

  it('rejects non-admins', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'member', error: null })
    const { setMemberRoleAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await setMemberRoleAction('C1', 'u2', 'juror', 'slug')
    expect(result.error).toMatch(/community admins/i)
  })

  it('allows admin to promote member', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'admin', error: null })
    mocks.setMemberRole.mockResolvedValue({ data: { user_id: 'u2', role: 'juror' }, error: null })
    const { setMemberRoleAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await setMemberRoleAction('C1', 'u2', 'juror', 'slug')
    expect(result.error).toBeNull()
  })
})

describe('generateInviteAction', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
  })

  it('rejects non-admins', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'member', error: null })
    const { generateInviteAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await generateInviteAction('C1')
    expect(result.error).toMatch(/admins/i)
  })

  it('generates invite for admin with 7-day expiry', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'admin', error: null })
    mocks.createInvite.mockResolvedValue({ data: { code: 'ABC123' }, error: null })
    const { generateInviteAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/community-actions')
    const result = await generateInviteAction('C1')
    expect(result.error).toBeNull()
    expect(result.data?.code).toBe('ABC123')

    const call = mocks.createInvite.mock.calls[0]
    const expiresAt = call[2].expiresAt
    const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000
    expect(Math.abs(expiresAt.getTime() - sevenDaysFromNow)).toBeLessThan(5000)
  })
})
