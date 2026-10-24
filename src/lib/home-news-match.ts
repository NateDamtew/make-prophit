/**
 * Keyword matching between home News stories and prediction markets.
 * Pure and client-safe: no db or Next imports.
 */

export interface HomeNewsMatchCandidate {
  title: string
  terms: string[]
}

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'against',
  'all',
  'amid',
  'and',
  'any',
  'are',
  'because',
  'before',
  'being',
  'between',
  'but',
  'can',
  'could',
  'daily',
  'does',
  'during',
  'for',
  'from',
  'get',
  'gets',
  'had',
  'has',
  'have',
  'her',
  'here',
  'him',
  'his',
  'how',
  'into',
  'its',
  'just',
  'market',
  'markets',
  'may',
  'more',
  'most',
  'new',
  'news',
  'not',
  'now',
  'off',
  'one',
  'our',
  'out',
  'over',
  'said',
  'say',
  'says',
  'she',
  'should',
  'some',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'why',
  'will',
  'with',
  'would',
  'year',
  'years',
  'yes',
  'you',
  'your',
])

export function tokenizeHomeNewsText(value: string | null | undefined) {
  return new Set(
    (value ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  )
}

/** Minimum shared tokens / score before a story is linked to a market. */
const MIN_SHARED_TOKENS = 2
const MIN_SCORE = 0.12

/**
 * Returns the index of the best-matching candidate for the story text, or -1
 * when nothing clears the relevance threshold. Scoring is cosine-like token
 * overlap so long market descriptions do not win on volume alone.
 */
export function findHomeNewsRelatedMarketIndex(storyText: string, candidates: HomeNewsMatchCandidate[]) {
  const storyTokens = tokenizeHomeNewsText(storyText)
  if (storyTokens.size === 0) {
    return -1
  }

  let bestIndex = -1
  let bestScore = 0
  let bestShared = 0

  candidates.forEach((candidate, index) => {
    const candidateTokens = tokenizeHomeNewsText(`${candidate.title} ${candidate.terms.join(' ')}`)
    if (candidateTokens.size === 0) {
      return
    }

    let shared = 0
    for (const token of candidateTokens) {
      if (storyTokens.has(token)) {
        shared += 1
      }
    }
    if (shared === 0) {
      return
    }

    const score = shared / Math.sqrt(storyTokens.size * candidateTokens.size)
    const qualifies = shared >= MIN_SHARED_TOKENS && score >= MIN_SCORE
    if (qualifies && (score > bestScore || (score === bestScore && shared > bestShared))) {
      bestIndex = index
      bestScore = score
      bestShared = shared
    }
  })

  return bestIndex
}
