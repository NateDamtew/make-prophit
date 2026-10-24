import { describe, expect, it } from 'bun:test'

import { findHomeNewsRelatedMarketIndex, tokenizeHomeNewsText } from '@/lib/home-news-match'

const candidates = [
  { title: 'Will the Fed cut rates in December?', terms: ['Economy', 'Fed rate cut December'] },
  { title: 'Arsenal vs Chelsea', terms: ['Sports', 'Arsenal', 'Chelsea', 'Premier League'] },
  { title: 'Bitcoin above $150k by year end?', terms: ['Crypto', 'Bitcoin'] },
]

describe('home-news-match', () => {
  it('tokenizes with accents folded and stop words dropped', () => {
    expect(Array.from(tokenizeHomeNewsText('Will Zürich markets rally after the news?'))).toEqual(['zurich', 'rally'])
  })

  it('links a story to the market sharing its key terms', () => {
    expect(
      findHomeNewsRelatedMarketIndex(
        'Fed signals a December rate cut as inflation cools. Economists expect the Fed to move.',
        candidates,
      ),
    ).toBe(0)
    expect(findHomeNewsRelatedMarketIndex('Arsenal beat Chelsea 2-1 in Premier League derby', candidates)).toBe(1)
  })

  it('returns -1 when no market clears the threshold', () => {
    expect(findHomeNewsRelatedMarketIndex('Local bakery wins national pastry award', candidates)).toBe(-1)
    expect(findHomeNewsRelatedMarketIndex('Bitcoin', candidates)).toBe(-1)
    expect(findHomeNewsRelatedMarketIndex('', candidates)).toBe(-1)
  })
})
