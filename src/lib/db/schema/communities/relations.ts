import { relations } from 'drizzle-orm'
import { users } from '@/lib/db/schema/auth/tables'
import { events } from '@/lib/db/schema/events/tables'
import {
  communities,
  community_invites,
  community_markets,
  community_members,
  community_reviews,
  jury_votes,
} from './tables'

export const communitiesRelations = relations(communities, ({ many, one }) => ({
  creator: one(users, {
    fields: [communities.creator_id],
    references: [users.id],
  }),
  members: many(community_members),
  markets: many(community_markets),
  reviews: many(community_reviews),
  invites: many(community_invites),
}))

export const communityMembersRelations = relations(community_members, ({ one }) => ({
  community: one(communities, {
    fields: [community_members.community_id],
    references: [communities.id],
  }),
  user: one(users, {
    fields: [community_members.user_id],
    references: [users.id],
  }),
  invitedByUser: one(users, {
    fields: [community_members.invited_by],
    references: [users.id],
    relationName: 'invited_members',
  }),
}))

export const communityMarketsRelations = relations(community_markets, ({ many, one }) => ({
  community: one(communities, {
    fields: [community_markets.community_id],
    references: [communities.id],
  }),
  event: one(events, {
    fields: [community_markets.event_id],
    references: [events.id],
  }),
  createdBy: one(users, {
    fields: [community_markets.created_by],
    references: [users.id],
  }),
  juryVotes: many(jury_votes),
}))

export const juryVotesRelations = relations(jury_votes, ({ one }) => ({
  communityMarket: one(community_markets, {
    fields: [jury_votes.community_market_id],
    references: [community_markets.id],
  }),
  juror: one(users, {
    fields: [jury_votes.juror_id],
    references: [users.id],
  }),
}))

export const communityReviewsRelations = relations(community_reviews, ({ one }) => ({
  community: one(communities, {
    fields: [community_reviews.community_id],
    references: [communities.id],
  }),
  user: one(users, {
    fields: [community_reviews.user_id],
    references: [users.id],
  }),
}))

export const communityInvitesRelations = relations(community_invites, ({ one }) => ({
  community: one(communities, {
    fields: [community_invites.community_id],
    references: [communities.id],
  }),
  createdBy: one(users, {
    fields: [community_invites.created_by],
    references: [users.id],
  }),
}))
