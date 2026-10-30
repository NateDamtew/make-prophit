import type { LeaderType } from '@/lib/communities/rules'

import { isLeaderType } from '@/lib/communities/rules'

/**
 * The community categories people browse by. Each leader type is one
 * category with its own page at `/communities/<slug>`; the four big ones
 * get a layout of their own (news, sports, creators, groups) and every
 * other category, including any added later, gets the default layout.
 *
 * To add a category: add the leader type to `rules.ts`, then an entry
 * here. The Explore page, the tabs and the category page follow.
 */

export type CategoryLayout = 'news' | 'sports' | 'creators' | 'groups' | 'default'

export interface CommunityCategory {
  /** URL segment under /communities/. */
  slug: string
  leaderType: LeaderType
  /** Tab label: "News". */
  label: string
  /** Page title: "News desks". */
  title: string
  /** One line under the title, desktop. */
  blurb: string
  /** The same, shorter, for phones. */
  blurbShort: string
  /** "14 news desks". */
  countNoun: { one: string; many: string }
  layout: CategoryLayout
  /** Section title on Explore: "News desks are asking". */
  exploreTitle: string
  exploreSubtitle: string
  /** Three or four words under the section title on Explore: "Politics, prices, policy". */
  tagline: string
  /** The call to lead one. */
  cta: { title: string; body: string; action: string }
  /** The record legend's noun: "that desk's last 10 results". */
  recordNoun: string
}

export const COMMUNITY_CATEGORIES: readonly CommunityCategory[] = [
  {
    slug: 'news',
    leaderType: 'news',
    label: 'News',
    title: 'News desks',
    blurb:
      'Newsrooms and journalists asking about prices, politics and policy. Every question names the public source that will settle it.',
    blurbShort: 'Newsrooms asking about prices, politics and policy. Every question names its source.',
    countNoun: { one: 'news desk', many: 'news desks' },
    layout: 'news',
    exploreTitle: 'News desks are asking',
    exploreSubtitle: 'Prices, politics and policy, settled by a named public source.',
    tagline: 'Politics, prices, policy',
    cta: {
      title: 'Run a newsroom?',
      body: 'Turn your stories into questions readers stake on, settled by your own editors in public. Verified newsrooms start at Level 2.',
      action: 'Start a community',
    },
    recordNoun: "that desk's",
  },
  {
    slug: 'sports',
    leaderType: 'sports',
    label: 'Sports',
    title: 'Sports pages',
    blurb:
      "Clubs, fan pages and leagues asking about the weekend's games. Stakes always close at kickoff, so nobody calls it after the whistle.",
    blurbShort: 'Fan pages and clubs asking about the weekend. Stakes close at kickoff.',
    countNoun: { one: 'sports page', many: 'sports pages' },
    layout: 'sports',
    exploreTitle: 'This weekend on the sports pages',
    exploreSubtitle: 'Stakes close at kickoff.',
    tagline: 'Derbies, leagues, the national team',
    cta: {
      title: 'Run a fan page?',
      body: 'Ask your fans about every match day and earn a share of every pool.',
      action: 'Start a community',
    },
    recordNoun: "that page's",
  },
  {
    slug: 'creators',
    leaderType: 'creator',
    label: 'Creators',
    title: 'Creators and shows',
    blurb:
      'Creators put their own call on every question and keep a public record. Shows ask about each episode. Beat them and it shows up on the board.',
    blurbShort: 'Creators make their own call on every question. Beat them and it counts.',
    countNoun: { one: 'creator', many: 'creators' },
    layout: 'creators',
    exploreTitle: 'Beat the creator',
    exploreSubtitle: 'They make a call on every question; your record against theirs is public.',
    tagline: 'Call it before they do',
    cta: {
      title: 'Got fans?',
      body: 'Make your call, let your fans try to beat it, and earn a share of every pool.',
      action: 'Start a community',
    },
    recordNoun: "that community's",
  },
  {
    slug: 'groups',
    leaderType: 'group',
    label: 'Groups',
    title: 'Groups',
    blurb:
      'Chamas, estates, offices, clubs and friends asking about their own lives. New groups have every question checked by Prophit before it opens.',
    blurbShort: 'Chamas, estates, offices and friends asking about their own lives.',
    countNoun: { one: 'group', many: 'groups' },
    layout: 'groups',
    exploreTitle: 'Groups near you',
    exploreSubtitle: 'Chamas, estates and offices. Members see the questions.',
    tagline: 'Chamas, estates, clubs, friends',
    cta: {
      title: 'Start one for your chama, estate or office',
      body: 'Ask the questions your group already argues about. Keep it invite only, pick 3 people you all trust to decide results, and settle up through M-Pesa.',
      action: 'Start a group',
    },
    recordNoun: "that group's",
  },
  {
    slug: 'events',
    leaderType: 'event',
    label: 'Events',
    title: 'Events',
    blurb:
      'Festivals, tournaments, elections and award nights: a community for the day, with questions that close as it happens.',
    blurbShort: 'Communities for one event, with questions that close as it happens.',
    countNoun: { one: 'event', many: 'events' },
    layout: 'default',
    exploreTitle: 'Happening now',
    exploreSubtitle: 'Questions that close as the event unfolds.',
    tagline: 'Festivals, tournaments, award nights',
    cta: {
      title: 'Running an event?',
      body: 'Ask your crowd what happens next and settle it on the night.',
      action: 'Start a community',
    },
    recordNoun: "that community's",
  },
]

export function getCategoryBySlug(slug: string): CommunityCategory | null {
  return COMMUNITY_CATEGORIES.find((category) => category.slug === slug.toLowerCase()) ?? null
}

export function getCategoryForLeaderType(leaderType: string | null | undefined): CommunityCategory | null {
  if (!isLeaderType(leaderType)) {
    return null
  }
  return COMMUNITY_CATEGORIES.find((category) => category.leaderType === leaderType) ?? null
}

/** "14 news desks", "1 group". */
export function countLabel(category: CommunityCategory, count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? category.countNoun.one : category.countNoun.many}`
}
