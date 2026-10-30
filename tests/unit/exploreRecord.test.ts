import { describe, expect, it } from 'bun:test'

import type { RecordMark } from '@/lib/db/queries/community-explore'

import { LOW_STAKES_BELOW, oddsLabels } from '@/components/communities/explore/QuestionCard'
import { recordLabel, recordSummary } from '@/components/communities/explore/RecordBars'

function marks(spec: string): RecordMark[] {
  const map: Record<string, RecordMark> = { o: 'stood', l: 'late', x: 'overturned', n: 'pending' }
  return spec.split('').map((char) => map[char]!)
}

describe('record words', () => {
  it('words the record the way the cards say it', () => {
    expect(recordLabel(marks('oooooooooo'))).toBe('10 of 10 stood')
    expect(recordLabel(marks('nnoooooooo'))).toBe('8 of 8 stood')
    expect(recordLabel(marks('nnnnnnnooo'))).toBe('3 decided')
    expect(recordLabel(marks('oooooloooo'))).toBe('9 stood, 1 late')
    expect(recordLabel(marks('ooooooooxo'))).toBe('9 stood, 1 overturned')
    expect(recordLabel(marks('nnnnnnnnnn'))).toBe('No results yet')
  })

  it('sums the record up for the hero', () => {
    expect(recordSummary(marks('oooooooooo'))).toBe('Their last 10 results all stood.')
    expect(recordSummary(marks('nnnnnnnnno'))).toBe('Its one result stood.')
    expect(recordSummary(marks('oooooloooo'))).toBe('9 of the last 10 results stood.')
  })
})

describe('odds on buttons', () => {
  it('shows plain Yes and No under the low-stakes line', () => {
    expect(oddsLabels({ yesChance: 0.62, stakeCount: LOW_STAKES_BELOW - 1 }, 'Yes', 'No')).toEqual({
      yes: 'Yes',
      no: 'No',
    })
    expect(oddsLabels({ yesChance: 0.62, stakeCount: LOW_STAKES_BELOW }, 'Yes', 'No')).toEqual({
      yes: 'Yes 62%',
      no: 'No 38%',
    })
  })
})
