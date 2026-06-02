import { describe, expect, it } from 'vitest'
import { getConsensusThreshold, getMaxMembersForJurySize } from '@/lib/community-config'

describe('community-config: jury capacity', () => {
  it('maps jury sizes to expected member caps', () => {
    expect(getMaxMembersForJurySize(1)).toBe(5)
    expect(getMaxMembersForJurySize(2)).toBe(20)
    expect(getMaxMembersForJurySize(3)).toBe(30)
    expect(getMaxMembersForJurySize(5)).toBe(50)
    expect(getMaxMembersForJurySize(10)).toBe(1000)
  })

  it('falls back to 5 members for unknown jury sizes', () => {
    expect(getMaxMembersForJurySize(0)).toBe(5)
    expect(getMaxMembersForJurySize(11)).toBe(5)
    expect(getMaxMembersForJurySize(-1)).toBe(5)
  })
})

describe('community-config: consensus thresholds', () => {
  it('requires unanimous votes for jury size 1 and 2', () => {
    expect(getConsensusThreshold(1)).toBe(1)
    expect(getConsensusThreshold(2)).toBe(2)
  })

  it('requires >75% (rounded up) for larger juries', () => {
    expect(getConsensusThreshold(3)).toBe(3) // ceil(2.25)
    expect(getConsensusThreshold(4)).toBe(3) // ceil(3.0)
    expect(getConsensusThreshold(5)).toBe(4) // ceil(3.75)
    expect(getConsensusThreshold(10)).toBe(8) // ceil(7.5)
  })

  it('threshold never exceeds jury size', () => {
    for (let n = 1; n <= 10; n++) {
      expect(getConsensusThreshold(n)).toBeLessThanOrEqual(n)
    }
  })
})
