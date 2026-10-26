'use client'

import type { ReactNode } from 'react'

import { useExtracted } from 'next-intl'

import type { HomeFeedData, HomeFeedMarketCard } from '@/lib/home-feed-types'

import HomeFeedCommunities from '@/app/[locale]/(platform)/(home)/_components/home-feed/HomeFeedCommunities'
import HomeFeedLiveStrip from '@/app/[locale]/(platform)/(home)/_components/home-feed/HomeFeedLiveStrip'
import {
  HomeFeedBigChanceCard,
  HomeFeedOutcomeBarsCard,
  HomeFeedSportsCard,
  HomeFeedSportsPlaceholderCard,
  HomeFeedStoryCard,
  HomeFeedUpDownCard,
} from '@/app/[locale]/(platform)/(home)/_components/home-feed/HomeFeedMarketCards'
import HomeFeedNews from '@/app/[locale]/(platform)/(home)/_components/home-feed/HomeFeedNews'
import {
  HOME_FEED_CARD_GRID_CLASS,
  HomeFeedPlaceholderNote,
  HomeFeedSectionHeading,
} from '@/app/[locale]/(platform)/(home)/_components/home-feed/HomeFeedPrimitives'
import HomeFeedSidebar from '@/app/[locale]/(platform)/(home)/_components/home-feed/HomeFeedSidebar'
import { HOME_FEED_CARDS_PER_SECTION } from '@/lib/home-feed-types'

const PROPHIT_TELEGRAM_URL = 'https://t.me/prophit'

interface HomeFeedProps {
  currentTimestamp: number | null
  data: HomeFeedData
}

interface CardSectionProps {
  cards: HomeFeedMarketCard[]
  href?: string
  id: string
  note?: ReactNode
  renderCard: (card: HomeFeedMarketCard, index: number) => ReactNode
  title: string
  trailing?: ReactNode
}

function CardSection({ cards, href, id, note, renderCard, title, trailing }: CardSectionProps) {
  if (cards.length === 0 && !trailing) {
    return null
  }

  return (
    <section aria-labelledby={id}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <HomeFeedSectionHeading id={id} href={href}>
          {title}
        </HomeFeedSectionHeading>
        {note}
      </div>
      <div className={HOME_FEED_CARD_GRID_CLASS}>
        {cards.map((card, index) => renderCard(card, index))}
        {trailing}
      </div>
    </section>
  )
}

function renderStoryCard(card: HomeFeedMarketCard) {
  return <HomeFeedStoryCard key={card.id} card={card} />
}

function renderUpDownCard(card: HomeFeedMarketCard) {
  return <HomeFeedUpDownCard key={card.id} card={card} />
}

function renderBigChanceCard(card: HomeFeedMarketCard) {
  return <HomeFeedBigChanceCard key={card.id} card={card} />
}

function renderPoliticsCard(card: HomeFeedMarketCard, index: number) {
  if (index === 0 && card.outcomes.length === 0) {
    return <HomeFeedBigChanceCard key={card.id} card={card} />
  }

  return <HomeFeedOutcomeBarsCard key={card.id} card={card} />
}

function renderSportsCard(card: HomeFeedMarketCard) {
  return <HomeFeedSportsCard key={card.id} card={card} />
}

export default function HomeFeed({ currentTimestamp, data }: HomeFeedProps) {
  const t = useExtracted()
  const sportsPlaceholderCount = Math.max(0, HOME_FEED_CARDS_PER_SECTION - data.sports.length)

  return (
    <div className="flex flex-col gap-8">
      <HomeFeedLiveStrip items={data.liveNow} />

      <div className="flex flex-wrap items-start gap-10">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-12">
          <CardSection
            id="home-feed-top-stories"
            title={t('Top stories')}
            href="/"
            cards={data.topStories}
            renderCard={renderStoryCard}
          />
          <CardSection
            id="home-feed-crypto"
            title={t('Crypto, up or down')}
            href="/crypto"
            cards={data.cryptoUpDown}
            renderCard={renderUpDownCard}
          />
          <HomeFeedCommunities communities={data.communities} />
          <CardSection
            id="home-feed-finance"
            title={t('Finance and commodities')}
            href="/finance"
            cards={data.finance}
            renderCard={renderBigChanceCard}
          />
          <CardSection
            id="home-feed-politics"
            title={t('Politics')}
            href="/politics"
            cards={data.politics}
            renderCard={renderPoliticsCard}
          />
          <CardSection
            id="home-feed-sports"
            title={t('Sports')}
            href="/sports/live"
            cards={data.sports}
            renderCard={renderSportsCard}
            note={
              sportsPlaceholderCount > 0 ? (
                <HomeFeedPlaceholderNote>{t('Placeholders until more sports markets go live')}</HomeFeedPlaceholderNote>
              ) : null
            }
            trailing={
              sportsPlaceholderCount > 0
                ? Array.from({ length: sportsPlaceholderCount }, (_, index) => (
                    <HomeFeedSportsPlaceholderCard key={`sports-placeholder-${index}`} />
                  ))
                : null
            }
          />
          <HomeFeedNews feed={data.news} currentTimestamp={currentTimestamp} />
        </div>

        <HomeFeedSidebar
          mostTraded={data.mostTraded}
          breakingNews={data.breakingNews}
          telegramUrl={PROPHIT_TELEGRAM_URL}
        />
      </div>
    </div>
  )
}
