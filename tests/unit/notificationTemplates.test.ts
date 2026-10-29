import { describe, expect, it } from 'bun:test'

import {
  appealOpenedNotice,
  closingSoonNotice,
  juryVoteDueNotice,
  marketAddedNotice,
  NOTICE_MAX_CHARS,
  payoutReleasedNotice,
  resultInNotice,
  stakesRefundedNotice,
  youWonNotice,
} from '@/lib/communities/notification-templates'

const longTitle =
  'Will the Energy and Petroleum Regulatory Authority raise the Nairobi super petrol pump price above 200 KES per litre in its 14 December monthly review?'

describe('community notice templates', () => {
  it('keeps every description within the SMS budget, even with a long title', () => {
    const notices = [
      closingSoonNotice({ marketTitle: longTitle, minutesLeft: 60 }),
      resultInNotice({ marketTitle: longTitle, outcome: 'yes', holdHours: 24 }),
      stakesRefundedNotice({ marketTitle: longTitle, reason: 'late_jury' }),
      youWonNotice({ marketTitle: longTitle, payoutMinor: 147_000n, currency: 'KES' }),
      payoutReleasedNotice({ marketTitle: longTitle, outcome: 'no' }),
      appealOpenedNotice({ marketTitle: longTitle, claimedOutcome: 'no', backersNeeded: 12 }),
      juryVoteDueNotice({ marketTitle: longTitle, hoursLeft: 72 }),
      marketAddedNotice({ marketTitle: longTitle, communityName: 'Nairobi Fuel Watch' }),
    ]
    for (const notice of notices) {
      expect(notice.description.length).toBeLessThanOrEqual(NOTICE_MAX_CHARS)
      expect(notice.title.length).toBeGreaterThan(0)
      expect(notice.linkLabel.length).toBeGreaterThan(0)
    }
  })

  it('says the amount and the outcome in words', () => {
    expect(youWonNotice({ marketTitle: 'Rain on Sunday?', payoutMinor: 147_000n, currency: 'KES' }).title).toBe(
      'You won 1,470 KES',
    )
    expect(resultInNotice({ marketTitle: 'Rain on Sunday?', outcome: 'no', holdHours: 24 }).title).toBe('Result in: No')
    expect(closingSoonNotice({ marketTitle: 'Rain on Sunday?', minutesLeft: 1 }).description).toContain(
      'closes in a minute',
    )
    expect(juryVoteDueNotice({ marketTitle: 'Rain on Sunday?', hoursLeft: 0.5 }).description).toContain(
      'within the hour',
    )
  })
})
