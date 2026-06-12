/**
 * Hardcoded market templates for Phase 2's one-screen creator.
 *
 * Each template is a starting point that the creator customises in-place.
 * Templates intentionally use placeholder tokens like `[event]` or `[date]` —
 * the AI assist + manual edits replace them. They write through the same
 * MarketDraftSchema as the wizard, so the review pipeline is untouched.
 *
 * Per-community custom templates are deliberately deferred to a later phase;
 * the constant here is enough to validate the pattern and onboard creators.
 */

import type { LucideIcon } from 'lucide-react'
import { AwardIcon, BarChart3Icon, CoinsIcon, NewspaperIcon, TrophyIcon, VoteIcon } from 'lucide-react'

export interface MarketTemplate {
  id: string
  name: string
  description: string
  icon: LucideIcon
  /** Suggested binary question prompt the creator edits. */
  binary_question_pattern: string
  /** Suggested resolution source — concrete enough that the AI builds on it. */
  resolution_source_hint: string
  /** Skeleton resolution rules; Gemini fills the gaps when AI-assisted. */
  resolution_rules_skeleton: string
  /** Suggested days-from-now for the resolution date. Creator can override. */
  default_days_to_resolution: number
  /** Suggested main category slug (must exist in the platform's category list). */
  main_category_slug?: string
  /** Short example titles to show creators what good looks like. */
  examples: string[]
}

export const MARKET_TEMPLATES = [
  {
    id: 'news-event',
    name: 'News event',
    description: 'A headline-driven yes/no on whether something will happen by a date.',
    icon: NewspaperIcon,
    binary_question_pattern: 'Will [event] happen by [date]?',
    resolution_source_hint: 'Reuters, Associated Press, or the official source cited in the original announcement.',
    resolution_rules_skeleton: 'Resolves YES if [specific outcome] is reported by [resolution source] before [resolution date]. Resolves NO otherwise. Coverage from a single source is insufficient; require corroboration from at least two reputable outlets.',
    default_days_to_resolution: 14,
    main_category_slug: 'news',
    examples: [
      'Will the UN Security Council adopt a ceasefire resolution by March 31?',
      'Will OpenAI announce GPT-6 before the end of Q3?',
    ],
  },
  {
    id: 'election',
    name: 'Election outcome',
    description: 'Will a specific candidate or party win a specific race?',
    icon: VoteIcon,
    binary_question_pattern: 'Will [candidate] win the [race] election?',
    resolution_source_hint: 'The official electoral commission for the jurisdiction (e.g. UK Electoral Commission, FEC, Comelec).',
    resolution_rules_skeleton: 'Resolves YES if [candidate] is officially declared the winner of [race] by [electoral body]. Concedes count as a YES once the formal declaration follows. Resolves NO if any other candidate is declared the winner or the result is annulled.',
    default_days_to_resolution: 60,
    main_category_slug: 'politics',
    examples: [
      'Will Labour win the next UK general election?',
      'Will the incumbent win the Brazilian presidential runoff?',
    ],
  },
  {
    id: 'sports-score',
    name: 'Sports outcome',
    description: 'Win, draw, or score-line on a specific match or tournament.',
    icon: TrophyIcon,
    binary_question_pattern: 'Will [team] win against [opponent] on [date]?',
    resolution_source_hint: 'The official league or governing body (e.g. Premier League, NBA, FIFA, ICC).',
    resolution_rules_skeleton: 'Resolves YES if [team] wins the match according to the official result published by [governing body]. Extra time and penalties count toward the official winner. Resolves NO on a draw or opposition win. If the match is cancelled or replayed, resolves based on the replayed result.',
    default_days_to_resolution: 7,
    main_category_slug: 'sports',
    examples: [
      'Will Arsenal win their next Premier League match?',
      'Will the Lakers make the NBA finals this season?',
    ],
  },
  {
    id: 'earnings-beat',
    name: 'Earnings beat',
    description: 'Will a public company beat consensus EPS or revenue?',
    icon: BarChart3Icon,
    binary_question_pattern: 'Will [company] beat consensus EPS in [quarter]?',
    resolution_source_hint: 'The company\'s quarterly earnings press release and the consensus estimate published by Bloomberg, Reuters, or Refinitiv at market close the day before earnings.',
    resolution_rules_skeleton: 'Resolves YES if [company] reports GAAP earnings-per-share above the consensus estimate published by [data source] as of market close on the trading day prior to the earnings release. Resolves NO if reported EPS is at or below consensus. Non-GAAP figures are ignored.',
    default_days_to_resolution: 45,
    main_category_slug: 'finance',
    examples: [
      'Will NVIDIA beat consensus EPS in Q4 FY26?',
      'Will Apple report higher iPhone revenue than consensus this quarter?',
    ],
  },
  {
    id: 'crypto-price',
    name: 'Crypto price target',
    description: 'Will an asset trade above a threshold by a date?',
    icon: CoinsIcon,
    binary_question_pattern: 'Will [asset] close above [price] by [date]?',
    resolution_source_hint: 'CoinGecko or CoinMarketCap daily-close in USD. Use the 00:00 UTC close as the reference time.',
    resolution_rules_skeleton: 'Resolves YES if [asset] records at least one daily close at or above [price] in USD on [data source] between now and [resolution date], 23:59 UTC. Resolves NO otherwise. Intraday spikes that are not reflected in the daily close do not qualify.',
    default_days_to_resolution: 30,
    main_category_slug: 'crypto',
    examples: [
      'Will Bitcoin close above $120,000 by August 1?',
      'Will Ethereum close above $5,000 in the next 30 days?',
    ],
  },
  {
    id: 'award-winner',
    name: 'Award winner',
    description: 'Will a specific nominee win a specific award?',
    icon: AwardIcon,
    binary_question_pattern: 'Will [nominee] win [award]?',
    resolution_source_hint: 'The official awarding body and its broadcast / press release (e.g. the Academy, BAFTA, the Booker Prize Foundation).',
    resolution_rules_skeleton: 'Resolves YES if [nominee] is announced as the winner of [award] on the official ceremony broadcast, confirmed by [awarding body]\'s press materials. Resolves NO if any other nominee wins, or if the award is not given.',
    default_days_to_resolution: 21,
    main_category_slug: 'culture',
    examples: [
      'Will "Oppenheimer" win Best Picture at the Oscars?',
      'Will Taylor Swift win Album of the Year at the Grammys?',
    ],
  },
] as const satisfies readonly MarketTemplate[]

export type MarketTemplateId = (typeof MARKET_TEMPLATES)[number]['id']
