import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/drizzle', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue([]),
      }),
    }),
  },
}))

vi.mock('@/lib/db/schema/events/tables', () => ({
  events: { community_id: 'events.community_id' },
}))

vi.mock('@/lib/db/schema/communities/tables', () => ({
  community_members: { community_id: 'cm.community_id', user_id: 'cm.user_id' },
}))

describe('community-visibility: filterEventsByCommunityVisibility', () => {
  it('keeps public events with no community_id', async () => {
    const { filterEventsByCommunityVisibility } = await import('@/lib/community-visibility')
    const events = [
      { id: '1', community_id: null },
      { id: '2', community_id: undefined },
      { id: '3', community_id: 'C1' },
    ]
    const result = filterEventsByCommunityVisibility(events, new Set())
    expect(result.map(e => e.id)).toEqual(['1', '2'])
  })

  it('includes events from communities the user is a member of', async () => {
    const { filterEventsByCommunityVisibility } = await import('@/lib/community-visibility')
    const events = [
      { id: '1', community_id: null },
      { id: '2', community_id: 'C1' },
      { id: '3', community_id: 'C2' },
      { id: '4', community_id: 'C3' },
    ]
    const result = filterEventsByCommunityVisibility(events, new Set(['C1', 'C3']))
    expect(result.map(e => e.id)).toEqual(['1', '2', '4'])
  })

  it('returns empty array when given empty list', async () => {
    const { filterEventsByCommunityVisibility } = await import('@/lib/community-visibility')
    expect(filterEventsByCommunityVisibility([], new Set())).toEqual([])
  })
})
