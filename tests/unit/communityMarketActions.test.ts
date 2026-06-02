import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getMemberRole: vi.fn(),
  addMarket: vi.fn(),
  updateMarket: vi.fn(),
  publishMarket: vi.fn(),
  deleteMarket: vi.fn(),
  analyzeMarket: vi.fn(),
}))

vi.mock('@/lib/db/queries/user', () => ({
  UserRepository: { getCurrentUser: mocks.getCurrentUser },
}))

vi.mock('@/lib/db/queries/community', () => ({
  CommunityRepository: {
    getMemberRole: mocks.getMemberRole,
    addMarket: mocks.addMarket,
    updateMarket: mocks.updateMarket,
    publishMarket: mocks.publishMarket,
    deleteMarket: mocks.deleteMarket,
  },
}))

vi.mock('@/lib/ai/gemini', () => ({
  analyzeMarketQuestion: mocks.analyzeMarket,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('analyzeMarketAction (Gemini)', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
  })

  it('rejects unauthenticated users', async () => {
    mocks.getCurrentUser.mockResolvedValue(null)
    const { analyzeMarketAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/market-actions')
    const result = await analyzeMarketAction({ question: 'Will it happen?' })
    expect(result.error).toBe('Unauthenticated.')
  })

  it('rejects questions shorter than 5 characters', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    const { analyzeMarketAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/market-actions')
    const result = await analyzeMarketAction({ question: 'a' })
    expect(result.error).toMatch(/at least 5 characters/i)
  })

  it('returns AI suggestion on success', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.analyzeMarket.mockResolvedValue({
      refined_title: 'Refined question?',
      resolution_source: 'World Bank Data',
      resolution_rules: 'Resolves YES if X.',
    })
    const { analyzeMarketAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/market-actions')
    const result = await analyzeMarketAction({ question: 'Will GDP grow?' })
    expect(result.error).toBeNull()
    expect(result.data?.refined_title).toBe('Refined question?')
  })

  it('surfaces gemini errors to caller', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.analyzeMarket.mockRejectedValue(new Error('Gemini API timeout'))
    const { analyzeMarketAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/market-actions')
    const result = await analyzeMarketAction({ question: 'Will GDP grow?' })
    expect(result.error).toMatch(/timeout/i)
  })
})

describe('createMarketDraftAction', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
  })

  it('rejects non-community-admins', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'member', error: null })
    const { createMarketDraftAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/market-actions')
    const result = await createMarketDraftAction('C1', 'slug', {
      title: 'Will it rain tomorrow in Addis?',
      resolution_rules: 'Resolves YES if measured precipitation exceeds X mm.',
    })
    expect(result.error).toMatch(/community owner/i)
  })

  it('rejects titles shorter than 10 chars', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'admin', error: null })
    const { createMarketDraftAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/market-actions')
    const result = await createMarketDraftAction('C1', 'slug', {
      title: 'short',
      resolution_rules: 'Resolution rules that meet minimum length easily.',
    })
    expect(result.error).toMatch(/at least 10 characters/i)
  })

  it('rejects resolution rules shorter than 20 chars', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'admin', error: null })
    const { createMarketDraftAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/market-actions')
    const result = await createMarketDraftAction('C1', 'slug', {
      title: 'Will it rain tomorrow in Addis?',
      resolution_rules: 'too short',
    })
    expect(result.error).toMatch(/at least 20 characters/i)
  })

  it('creates draft with status=draft', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'admin', error: null })
    mocks.addMarket.mockResolvedValue({ data: { id: 'M1' }, error: null })
    const { createMarketDraftAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/market-actions')
    const result = await createMarketDraftAction('C1', 'slug', {
      title: 'Will it rain tomorrow in Addis?',
      resolution_rules: 'Resolves YES if precipitation is at least 1mm.',
    })
    expect(result.error).toBeNull()
    expect(mocks.addMarket).toHaveBeenCalledWith(expect.objectContaining({
      status: 'draft',
      community_id: 'C1',
      created_by: 'u1',
    }))
  })
})

describe('publishMarketAction', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
  })

  it('rejects non-admins', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'member', error: null })
    const { publishMarketAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/market-actions')
    const result = await publishMarketAction('M1', 'C1', 'slug')
    expect(result.error).toMatch(/community owner/i)
  })

  it('publishes draft for admin', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'admin', error: null })
    mocks.publishMarket.mockResolvedValue({ data: { id: 'M1', status: 'active' }, error: null })
    const { publishMarketAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/market-actions')
    const result = await publishMarketAction('M1', 'C1', 'slug')
    expect(result.error).toBeNull()
    expect(mocks.publishMarket).toHaveBeenCalledWith('M1')
  })
})

describe('deleteMarketAction', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset())
  })

  it('rejects non-admins', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'member', error: null })
    const { deleteMarketAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/market-actions')
    const result = await deleteMarketAction('M1', 'C1', 'slug')
    expect(result.error).toMatch(/community owner/i)
  })

  it('deletes market for admin', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'u1' })
    mocks.getMemberRole.mockResolvedValue({ data: 'admin', error: null })
    mocks.deleteMarket.mockResolvedValue({ data: { id: 'M1' }, error: null })
    const { deleteMarketAction } = await import('@/app/[locale]/(platform)/community/[slug]/_actions/market-actions')
    const result = await deleteMarketAction('M1', 'C1', 'slug')
    expect(result.error).toBeNull()
  })
})
