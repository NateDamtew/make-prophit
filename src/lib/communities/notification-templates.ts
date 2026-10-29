import { formatPoolMoney } from '@/lib/pools/format'

/**
 * The in-app notices a community sends, one template per kind. Every
 * description fits in 160 characters so the same text can go out as an
 * SMS later. Pure: no database, no dates computed here.
 */

export type CommunityNoticeKind =
  | 'closing_soon'
  | 'result_in'
  | 'stakes_refunded'
  | 'you_won'
  | 'payout_released'
  | 'appeal_opened'
  | 'jury_vote_due'
  | 'market_added'

export interface CommunityNotice {
  kind: CommunityNoticeKind
  title: string
  description: string
  linkLabel: string
}

export const NOTICE_MAX_CHARS = 160

/** Trim a market title so the rest of the sentence still fits. */
function shortTitle(title: string, max = 70): string {
  const clean = title.trim().replace(/\s+/g, ' ')
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`
}

function clip(text: string): string {
  return text.length <= NOTICE_MAX_CHARS ? text : `${text.slice(0, NOTICE_MAX_CHARS - 1).trimEnd()}…`
}

function outcomeWord(outcome: 'yes' | 'no' | 'cancelled' | null | undefined): string {
  return outcome === 'yes' ? 'Yes' : outcome === 'no' ? 'No' : 'Void'
}

export function closingSoonNotice(input: { marketTitle: string; minutesLeft: number }): CommunityNotice {
  const when = input.minutesLeft <= 1 ? 'in a minute' : `in ${Math.round(input.minutesLeft)} min`
  return {
    kind: 'closing_soon',
    title: 'Closing soon',
    description: clip(`${shortTitle(input.marketTitle)} closes ${when}. Last chance to stake.`),
    linkLabel: 'Stake now',
  }
}

export function resultInNotice(input: {
  marketTitle: string
  outcome: 'yes' | 'no'
  holdHours: number
}): CommunityNotice {
  return {
    kind: 'result_in',
    title: `Result in: ${outcomeWord(input.outcome)}`,
    description: clip(
      `${shortTitle(input.marketTitle)} resolved ${outcomeWord(input.outcome)}. Payouts land in ${input.holdHours}h unless someone appeals.`,
    ),
    linkLabel: 'See the verdicts',
  }
}

export function stakesRefundedNotice(input: {
  marketTitle: string
  reason: 'late_jury' | 'voided' | 'appeal'
}): CommunityNotice {
  const why =
    input.reason === 'late_jury'
      ? 'the jury missed its deadline'
      : input.reason === 'appeal'
        ? 'Prophit voided the result on appeal'
        : 'the market was voided'
  return {
    kind: 'stakes_refunded',
    title: 'Stakes refunded',
    description: clip(`${shortTitle(input.marketTitle)}: ${why}. Your stake is back in your balance.`),
    linkLabel: 'View market',
  }
}

export function youWonNotice(input: {
  marketTitle: string
  payoutMinor: bigint | string | number
  currency: string
}): CommunityNotice {
  const amount = formatPoolMoney(input.payoutMinor, input.currency)
  return {
    kind: 'you_won',
    title: `You won ${amount}`,
    description: clip(`${shortTitle(input.marketTitle)}. ${amount} is in your balance. Withdraw or stake again.`),
    linkLabel: 'Share your win',
  }
}

export function payoutReleasedNotice(input: { marketTitle: string; outcome: 'yes' | 'no' }): CommunityNotice {
  return {
    kind: 'payout_released',
    title: 'Payouts released',
    description: clip(
      `${shortTitle(input.marketTitle)} settled ${outcomeWord(input.outcome)}. Winners have been paid; the hold is over.`,
    ),
    linkLabel: 'View market',
  }
}

export function appealOpenedNotice(input: {
  marketTitle: string
  claimedOutcome: 'yes' | 'no' | 'cancelled'
  backersNeeded: number
}): CommunityNotice {
  return {
    kind: 'appeal_opened',
    title: 'Appeal opened',
    description: clip(
      `${shortTitle(input.marketTitle)}: a staker says it should be ${outcomeWord(input.claimedOutcome)}. ${input.backersNeeded} backers send it to Prophit. Payouts wait.`,
    ),
    linkLabel: 'See the appeal',
  }
}

export function juryVoteDueNotice(input: { marketTitle: string; hoursLeft: number }): CommunityNotice {
  const when = input.hoursLeft <= 1 ? 'within the hour' : `in ${Math.round(input.hoursLeft)}h`
  return {
    kind: 'jury_vote_due',
    title: 'Your jury vote is due',
    description: clip(
      `${shortTitle(input.marketTitle)} closed. Vote ${when}, with a reason and a source. A missed vote refunds the market.`,
    ),
    linkLabel: 'Vote now',
  }
}

export function marketAddedNotice(input: { marketTitle: string; communityName: string }): CommunityNotice {
  return {
    kind: 'market_added',
    title: `New in ${shortTitle(input.communityName, 40)}`,
    description: clip(`${shortTitle(input.marketTitle, 110)}. Make your call before it closes.`),
    linkLabel: 'Open market',
  }
}
