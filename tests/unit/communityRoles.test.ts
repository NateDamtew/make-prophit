import { describe, expect, it } from 'bun:test'

import { can, isCommunityRole, isJurorRole, isOwnerRole } from '@/lib/communities/roles'

describe('communities/roles', () => {
  it('gives owners and co-owners everything', () => {
    for (const role of ['admin', 'co_owner']) {
      expect(can(role, 'settings')).toBe(true)
      expect(can(role, 'members')).toBe(true)
      expect(can(role, 'markets')).toBe(true)
      expect(can(role, 'moderate')).toBe(true)
      expect(can(role, 'jury_vote')).toBe(true)
      expect(can(role, 'owner_money')).toBe(true)
      expect(isOwnerRole(role)).toBe(true)
      expect(isJurorRole(role)).toBe(true)
    }
  })

  it('limits editors to markets and moderators to comments', () => {
    expect(can('editor', 'markets')).toBe(true)
    expect(can('editor', 'settings')).toBe(false)
    expect(can('editor', 'owner_money')).toBe(false)
    expect(can('moderator', 'moderate')).toBe(true)
    expect(can('moderator', 'markets')).toBe(false)
    expect(isOwnerRole('editor')).toBe(false)
  })

  it('lets only jurors and owners vote, and nobody who is not a member', () => {
    expect(can('juror', 'jury_vote')).toBe(true)
    expect(can('member', 'jury_vote')).toBe(false)
    expect(can(null, 'jury_vote')).toBe(false)
    expect(can('nonsense', 'markets')).toBe(false)
    expect(isJurorRole('juror')).toBe(true)
    expect(isJurorRole('member')).toBe(false)
    expect(isCommunityRole('co_owner')).toBe(true)
    expect(isCommunityRole('owner')).toBe(false)
  })
})
