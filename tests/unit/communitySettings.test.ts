import { describe, expect, it } from 'bun:test'

import { DEFAULT_LEVEL_CAPS } from '@/lib/communities/rules'
import {
  parseCommunitySettings,
  parseJurySettings,
  parseLevelSettings,
  parseStakeSettings,
} from '@/lib/communities/settings'

describe('communities/settings: defaults', () => {
  it('returns the documented defaults when nothing is stored', () => {
    const settings = parseCommunitySettings(undefined)
    expect(settings.jury.bands.map((band) => band.seats)).toEqual([3, 5, 7, 9])
    expect(settings.jury.windowHours).toBe(72)
    expect(settings.jury.minReasonChars).toBe(80)
    expect(settings.levels[0].rakeBps).toBe(800)
    expect(settings.levels[1].rakeBps).toBe(700)
    expect(settings.levels[2].rakeBps).toBe(600)
    expect(settings.levels[0].reviewMode).toBe('every')
    expect(settings.stakes.minStakeMinor).toBe(2_000n)
    expect(settings.requireApplication).toBe(true)
    expect(settings.prophitCommunityIds).toEqual([])
  })
})

describe('communities/settings: parsing', () => {
  it('reads bigints from strings and keeps the pool-share split summing to 100%', () => {
    const levels = parseLevelSettings(
      JSON.stringify({ 1: { maxPerPersonMinor: '500000', ownerShareBps: 5000, juryShareBps: 3000 } }),
    )
    expect(levels[1].maxPerPersonMinor).toBe(500_000n)
    expect(levels[1].ownerShareBps).toBe(5_000)
    expect(levels[1].juryShareBps).toBe(3_000)
    expect(levels[1].prophitShareBps).toBe(2_000)
    expect(levels[0]).toEqual(DEFAULT_LEVEL_CAPS[0])
  })

  it('ignores malformed jury bands and keeps the defaults', () => {
    expect(parseJurySettings(JSON.stringify({ bands: [{ maxMembers: 10, seats: 3 }] })).bands.length).toBe(4)
    expect(parseJurySettings('not json').windowHours).toBe(72)
    const custom = parseJurySettings(
      JSON.stringify({
        bands: [
          { maxMembers: 100, seats: 3 },
          { maxMembers: null, seats: 5 },
        ],
        windowHours: 48,
      }),
    )
    expect(custom.bands.map((band) => band.seats)).toEqual([3, 5])
    expect(custom.windowHours).toBe(48)
  })

  it('reads the per-currency stake floor and the application switch', () => {
    const settings = parseCommunitySettings(
      {
        communities: {
          'stakes:KES': { value: JSON.stringify({ minStakeMinor: '5000' }) },
          require_application: { value: 'false' },
          prophit_community_ids: { value: JSON.stringify(['abc', 7, 'def']) },
        },
      },
      'kes',
    )
    expect(settings.stakes).toEqual({ currency: 'KES', minStakeMinor: 5_000n })
    expect(parseStakeSettings('UGX', undefined).currency).toBe('UGX')
    expect(settings.requireApplication).toBe(false)
    expect(settings.prophitCommunityIds).toEqual(['abc', 'def'])
  })
})
