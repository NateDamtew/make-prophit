import type { FeedItem } from '@/lib/db/queries/community-events'

/**
 * Renders a feed event into a human sentence. Centralised here so the Activity
 * tab and the small header ticker both use the same phrasing.
 */
export function describeFeedItem(item: FeedItem): string {
  const actor = item.actorLabel ? `@${item.actorLabel}` : 'Someone'
  const payload = item.payload ?? {}
  switch (item.kind) {
    case 'market.created':
      return `${actor} added market "${(payload.title as string) ?? 'a new market'}"`
    case 'market.resolved':
      return `Market "${(payload.title as string) ?? ''}" resolved ${(payload.outcome as string) ?? ''}`.trim()
    case 'market.disputed':
      return `Market "${(payload.title as string) ?? ''}" was disputed`
    case 'comment.posted':
      if (payload.deleted) {
        return `A comment was deleted`
      }
      return `${actor} commented on "${(payload.market_title as string) ?? 'a market'}"`
    case 'comment.replied':
      return `${actor} replied on "${(payload.market_title as string) ?? 'a market'}"`
    case 'reaction.added':
      return `${actor} reacted ${(payload.kind as string) ?? ''}`.trim()
    case 'member.joined':
      return `${actor} joined the community`
    case 'member.left':
      return `${actor} left the community`
    case 'review.submitted':
      return `${actor} left a ${(payload.rating as number) ?? '★'}-star review`
    case 'jury.voted':
      return `${actor} cast a jury vote (${(payload.vote as string) ?? '?'})`
    default:
      return `${actor} did something`
  }
}
