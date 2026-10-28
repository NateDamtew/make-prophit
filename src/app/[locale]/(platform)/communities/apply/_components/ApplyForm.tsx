'use client'

import { PlusIcon, TrashIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useState, useTransition } from 'react'

import type { LeaderType } from '@/lib/communities/rules'
import type { ApplicationView } from '@/lib/db/queries/applications'

import { applyToLeadAction } from '@/app/[locale]/(platform)/communities/_actions/application-actions'
import { LeaderTypeBadge } from '@/components/communities/trust/LeaderTypeBadge'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { useAppKit } from '@/hooks/useAppKit'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * The leader application: who you are, what the community predicts, three
 * to five sample questions with their sources, and where people can find
 * you. One form, saved as a draft in the browser until it is sent.
 */

const LEADER_TYPES: LeaderType[] = ['news', 'sports', 'creator', 'group', 'event']
const DRAFT_KEY = 'community-apply-draft'

interface Draft {
  leaderType: LeaderType | null
  name: string
  slug: string
  description: string
  audience: string
  sampleMarkets: Array<{ title: string; source: string; closesAt: string }>
  links: string[]
}

const EMPTY: Draft = {
  leaderType: null,
  name: '',
  slug: '',
  description: '',
  audience: '',
  sampleMarkets: [
    { title: '', source: '', closesAt: '' },
    { title: '', source: '', closesAt: '' },
    { title: '', source: '', closesAt: '' },
  ],
  links: [''],
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function readDraft(resume: ApplicationView | null): Draft {
  if (resume) {
    return {
      leaderType: resume.leaderType,
      name: resume.name,
      slug: resume.slug,
      description: resume.description,
      audience: resume.audience ?? '',
      sampleMarkets: resume.sampleMarkets.map((market) => ({
        title: market.title,
        source: market.source,
        closesAt: market.closesAt ?? '',
      })),
      links: resume.links.length > 0 ? resume.links : [''],
    }
  }
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (raw) {
      return { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) }
    }
  } catch {
    // no draft
  }
  return EMPTY
}

const inputClass =
  'h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground'

export default function ApplyForm({ signedIn, resume }: { signedIn: boolean; resume: ApplicationView | null }) {
  const t = useExtracted()
  const router = useRouter()
  const { open: openAppKit } = useAppKit()
  const [draft, setDraft] = useState<Draft>(() => (typeof window === 'undefined' ? EMPTY : readDraft(resume)))
  const [isSending, startSending] = useTransition()
  const editing = resume !== null

  function update(patch: Partial<Draft>) {
    setDraft((current) => {
      const next = { ...current, ...patch }
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next))
      } catch {
        // storage unavailable
      }
      return next
    })
  }

  function updateMarket(index: number, patch: Partial<Draft['sampleMarkets'][number]>) {
    update({ sampleMarkets: draft.sampleMarkets.map((market, i) => (i === index ? { ...market, ...patch } : market)) })
  }

  function handleSubmit() {
    if (!signedIn) {
      void openAppKit()
      return
    }
    if (!draft.leaderType) {
      toast.error(t('Pick what kind of leader you are.'))
      return
    }
    startSending(async () => {
      const result = await applyToLeadAction({
        leaderType: draft.leaderType!,
        name: draft.name,
        slug: draft.slug || slugify(draft.name),
        description: draft.description,
        audience: draft.audience || null,
        sampleMarkets: draft.sampleMarkets.filter((market) => market.title.trim() || market.source.trim()),
        links: draft.links.map((link) => link.trim()).filter(Boolean),
        currency: 'KES',
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      try {
        window.localStorage.removeItem(DRAFT_KEY)
      } catch {
        // ignore
      }
      toast.success(t('Application sent.'))
      router.refresh()
    })
  }

  const typeLabels: Record<LeaderType, string> = {
    news: t('Newsroom or journalist'),
    sports: t('Club, league or fan page'),
    creator: t('Creator or commentator'),
    group: t('Group: chama, office, class, friends'),
    event: t('Event: election, final, launch'),
  }

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault()
        handleSubmit()
      }}
    >
      <div>
        <h1 className="text-[26px]/tight font-bold">
          {editing ? t('Update your application') : t('Lead a community')}
        </h1>
        <p className="mt-2 text-sm/relaxed text-muted-foreground">
          {t(
            'Communities run on trust. Tell us who you are, what your people will predict, and how you will settle it. Prophit reads every application and starts approved leaders at Level 0, where each market is checked before it opens.',
          )}
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-[15px] font-bold">{t('What kind of leader are you?')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {LEADER_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => update({ leaderType: type })}
              aria-pressed={draft.leaderType === type}
              className={cn(
                'flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors',
                draft.leaderType === type
                  ? 'border-foreground bg-secondary'
                  : 'border-border bg-card hover:bg-secondary/40',
              )}
            >
              <LeaderTypeBadge type={type} className="h-6 text-[11px]" />
              <span>{typeLabels[type]}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-[15px] font-bold">{t('The community')}</legend>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted-foreground">
          {t('Name')}
          <input
            value={draft.name}
            onChange={(event) => update({ name: event.target.value, slug: draft.slug || slugify(event.target.value) })}
            className={inputClass}
            placeholder={t('Nairobi Politics Desk')}
            disabled={editing}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted-foreground">
          {t('Address')}
          <span className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">/community/</span>
            <input
              value={draft.slug}
              onChange={(event) => update({ slug: slugify(event.target.value) })}
              className={inputClass}
              disabled={editing}
            />
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted-foreground">
          {t('What will your community predict?')}
          <textarea
            value={draft.description}
            onChange={(event) => update({ description: event.target.value })}
            rows={3}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground"
            placeholder={t('Kenyan politics and policy: by-elections, bills, appointments, fuel prices.')}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted-foreground">
          {t('Who is your audience, and how many?')}
          <input
            value={draft.audience}
            onChange={(event) => update({ audience: event.target.value })}
            className={inputClass}
            placeholder={t('12k newsletter readers, 40k on X')}
          />
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-[15px] font-bold">{t('Three to five sample markets')}</legend>
        <p className="text-sm text-muted-foreground">
          {t(
            'A good market has one clear question, one source that will answer it, and a close time before the answer is known.',
          )}
        </p>
        {draft.sampleMarkets.map((market, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                {t('Market {n}', { n: String(index + 1) })}
              </span>
              {draft.sampleMarkets.length > 3 ? (
                <button
                  type="button"
                  onClick={() => update({ sampleMarkets: draft.sampleMarkets.filter((_, i) => i !== index) })}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t('Remove')}
                >
                  <TrashIcon className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <input
              value={market.title}
              onChange={(event) => updateMarket(index, { title: event.target.value })}
              className={inputClass}
              placeholder={t('Will petrol in Nairobi cost more than KES 200 per litre on 14 December?')}
            />
            <input
              value={market.source}
              onChange={(event) => updateMarket(index, { source: event.target.value })}
              className={inputClass}
              placeholder={t('Source: EPRA monthly price notice')}
            />
          </div>
        ))}
        {draft.sampleMarkets.length < 5 ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => update({ sampleMarkets: [...draft.sampleMarkets, { title: '', source: '', closesAt: '' }] })}
            className="self-start"
          >
            <PlusIcon className="size-4" aria-hidden="true" />
            {t('Add another')}
          </Button>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-[15px] font-bold">{t('Where people can find you')}</legend>
        {draft.links.map((link, index) => (
          <input
            key={index}
            value={link}
            onChange={(event) =>
              update({ links: draft.links.map((value, i) => (i === index ? event.target.value : value)) })
            }
            className={inputClass}
            placeholder="https://"
            type="url"
          />
        ))}
        {draft.links.length < 5 ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => update({ links: [...draft.links, ''] })}
            className="self-start"
          >
            <PlusIcon className="size-4" aria-hidden="true" />
            {t('Add a link')}
          </Button>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          size="lg"
          className="h-12 rounded-md text-base font-bold shadow-lg shadow-primary/20"
          disabled={isSending}
        >
          {isSending
            ? t('Sending…')
            : signedIn
              ? editing
                ? t('Send update')
                : t('Send application')
              : t('Sign up to apply')}
        </Button>
        <p className="text-xs text-muted-foreground">{t('Your draft stays in this browser until you send it.')}</p>
      </div>
    </form>
  )
}
