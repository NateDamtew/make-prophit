'use client'

import type { LucideIcon } from 'lucide-react'
import type { MarketSuggestion } from '@/lib/ai/gemini'
import type { MarketTemplateId } from '@/lib/communities/market-templates'
import type { ExtractedUrlContent } from '@/lib/communities/url-ingest'
import { AlertCircleIcon, AlertTriangleIcon, ChevronLeftIcon, FileTextIcon, LinkIcon, Loader2Icon, SaveIcon, SparklesIcon, WandSparklesIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MARKET_TEMPLATES } from '@/lib/communities/market-templates'
import { cn } from '@/lib/utils'
import { analyzeMarketAction, createMarketDraftAction } from '../../../_actions/market-actions'
import { MarketPreview } from './MarketPreview'

interface MarketCanvasProps {
  communityId: string
  communitySlug: string
  communityName: string
  communityIcon: string | null
  /** Existing draft to hydrate the canvas with (when editing). */
  initialDraft?: PartialDraft
}

interface PartialDraft {
  title?: string
  binary_question?: string
  resolution_source?: string
  resolution_rules?: string
  resolution_date?: string
  description?: string
  image_url?: string
  main_category_slug?: string
}

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function ChipButton({ icon: Icon, label, onClick, active }: { icon: LucideIcon, label: string, onClick: () => void, active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}

/**
 * One-screen market creator. AI does the heavy lifting by default; the old
 * 5-step wizard remains reachable behind an "Advanced" link for power users.
 * Writes through the same createMarketDraftAction the wizard uses, so the
 * super-admin review pipeline is undisturbed.
 */
export function MarketCanvas({ communityId, communitySlug, communityName, communityIcon, initialDraft }: MarketCanvasProps) {
  const router = useRouter()
  const [pending, startSaving] = useTransition()
  const [isAiBusy, setAiBusy] = useState(false)
  const [activeTemplate, setActiveTemplate] = useState<MarketTemplateId | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [clarifyingQuestions, setClarifyingQuestions] = useState<string[]>([])

  // Form state — identical field set to MarketDraftSchema.
  const [title, setTitle] = useState(initialDraft?.title ?? '')
  const [binaryQuestion, setBinaryQuestion] = useState(initialDraft?.binary_question ?? '')
  const [resolutionSource, setResolutionSource] = useState(initialDraft?.resolution_source ?? '')
  const [resolutionRules, setResolutionRules] = useState(initialDraft?.resolution_rules ?? '')
  const [resolutionDate, setResolutionDate] = useState(initialDraft?.resolution_date ?? '')
  const [description, setDescription] = useState(initialDraft?.description ?? '')
  const [imageUrl, setImageUrl] = useState(initialDraft?.image_url ?? '')
  const [binaryOutcomeYes] = useState('Yes')
  const [binaryOutcomeNo] = useState('No')

  // AI input — either a URL or freeform prompt.
  const [promptMode, setPromptMode] = useState<'prompt' | 'url'>('prompt')
  const [prompt, setPrompt] = useState('')

  // Min-validation matches the schema — title ≥ 10, rules ≥ 20.
  const canSaveDraft = useMemo(() => {
    return title.trim().length >= 10 && resolutionRules.trim().length >= 20 && !pending
  }, [title, resolutionRules, pending])

  function applySuggestion(suggestion: MarketSuggestion, sourceUrl?: string) {
    if (suggestion.refined_title) {
      setTitle(suggestion.refined_title)
      // Mirror the title into binary question if it reads as a question.
      if (!binaryQuestion && suggestion.refined_title.endsWith('?')) {
        setBinaryQuestion(suggestion.refined_title)
      }
    }
    if (suggestion.resolution_source) {
      setResolutionSource(suggestion.resolution_source)
    }
    if (suggestion.resolution_rules) {
      setResolutionRules(suggestion.resolution_rules)
    }
    if (suggestion.suggested_resolution_date) {
      // Gemini sometimes returns full ISO; the input expects YYYY-MM-DD.
      setResolutionDate(suggestion.suggested_resolution_date.slice(0, 10))
    }
    if (sourceUrl && !description) {
      setDescription(`Source: ${sourceUrl}`)
    }
    setClarifyingQuestions(suggestion.clarifying_questions ?? [])
    setWarnings(suggestion.warnings ?? [])
  }

  function applyTemplate(id: MarketTemplateId) {
    const tpl = MARKET_TEMPLATES.find(t => t.id === id)
    if (!tpl) {
      return
    }
    setActiveTemplate(id)
    if (!title) {
      setTitle(tpl.binary_question_pattern)
    }
    if (!binaryQuestion) {
      setBinaryQuestion(tpl.binary_question_pattern)
    }
    if (!resolutionSource) {
      setResolutionSource(tpl.resolution_source_hint)
    }
    if (!resolutionRules) {
      setResolutionRules(tpl.resolution_rules_skeleton)
    }
    if (!resolutionDate) {
      setResolutionDate(daysFromNow(tpl.default_days_to_resolution))
    }
    setWarnings([])
    setClarifyingQuestions([])
    toast.message(`Template loaded: ${tpl.name}`, {
      description: 'Replace the bracketed placeholders, then ask the AI to refine.',
    })
  }

  async function runAi() {
    const cleaned = prompt.trim()
    if (cleaned.length < 5) {
      toast.error('Add a few more words for the AI to work with.')
      return
    }
    setAiBusy(true)
    try {
      if (promptMode === 'url') {
        const res = await fetch('/api/communities/markets/ingest-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ community_id: communityId, url: cleaned }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(body?.error || 'URL ingestion failed.')
        }
        if (body?.warning) {
          toast.warning(body.warning)
        }
        const suggestion: MarketSuggestion | null = body?.data?.suggestion ?? null
        const source: ExtractedUrlContent | null = body?.data?.source ?? null
        if (source?.ogImage && !imageUrl) {
          setImageUrl(source.ogImage)
        }
        if (suggestion) {
          applySuggestion(suggestion, source?.finalUrl)
          toast.success('AI drafted a market from that URL.')
        }
        else if (source?.title) {
          // Source extracted, AI failed: pre-fill the title at least.
          if (!title) {
            setTitle(source.title)
          }
          toast.success('Pulled the headline; finish the rest by hand or retry the AI.')
        }
      }
      else {
        // Prompt mode — call the existing analyze server action directly.
        const { error, data } = await analyzeMarketAction({ question: cleaned })
        if (error || !data) {
          throw new Error(error ?? 'AI failed to respond.')
        }
        applySuggestion(data)
        toast.success('AI drafted a market from your prompt.')
      }
    }
    catch (error) {
      toast.error((error as Error).message)
    }
    finally {
      setAiBusy(false)
    }
  }

  function handleSaveDraft() {
    startSaving(async () => {
      const result = await createMarketDraftAction(communityId, communitySlug, {
        title: title.trim(),
        description: description.trim() || undefined,
        image_url: imageUrl.trim() || undefined,
        resolution_source: resolutionSource.trim() || undefined,
        resolution_rules: resolutionRules.trim(),
        resolution_date: resolutionDate || undefined,
        market_mode: 'binary',
        binary_question: binaryQuestion.trim() || undefined,
        binary_outcome_yes: binaryOutcomeYes,
        binary_outcome_no: binaryOutcomeNo,
      })
      if (result.error || !result.data) {
        toast.error(result.error ?? 'Could not save draft.')
        return
      }
      toast.success('Draft saved. Submit for review when you\'re ready.')
      // Land on the drafts list so the admin can submit immediately.
      router.replace(`/community/${communitySlug}/markets/new?tab=drafts`)
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
      {/* Left: AI prompt + template picker + form */}
      <div className="grid gap-6">
        {/* AI assist */}
        <section className="rounded-sm border bg-card p-4">
          <header className="mb-3 flex items-center gap-2">
            <WandSparklesIcon className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">AI market drafter</h2>
            <span className="ms-auto text-xs text-muted-foreground">Powered by Gemini</span>
          </header>

          <div className="mb-2 flex gap-1.5">
            <ChipButton icon={FileTextIcon} label="From a prompt" active={promptMode === 'prompt'} onClick={() => setPromptMode('prompt')} />
            <ChipButton icon={LinkIcon} label="From a URL" active={promptMode === 'url'} onClick={() => setPromptMode('url')} />
          </div>

          <div className="flex gap-2">
            <Input
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={promptMode === 'url'
                ? 'Paste a news article, Reuters / AP link, GitHub release URL…'
                : 'Describe the market — a headline, a question, a sentence about what to forecast'}
            />
            <Button onClick={runAi} disabled={isAiBusy || prompt.trim().length < 5}>
              {isAiBusy ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
              {isAiBusy ? 'Drafting…' : 'Draft with AI'}
            </Button>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            The AI fills the form on the right. You always review before saving — and the super-admin reviews before publishing.
          </p>
        </section>

        {/* Templates */}
        <section className="rounded-sm border bg-card p-4">
          <header className="mb-3 flex items-center gap-2">
            <SparklesIcon className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Start from a template</h2>
          </header>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MARKET_TEMPLATES.map((tpl) => {
              const Icon = tpl.icon
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl.id)}
                  className={cn(
                    `
                      group flex flex-col items-start gap-1.5 rounded-sm border bg-background p-3 text-left
                      transition-colors
                    `,
                    activeTemplate === tpl.id ? 'border-primary' : 'border-border hover:border-primary/40',
                  )}
                >
                  <Icon className="size-4 text-primary" />
                  <span className="text-sm font-medium">{tpl.name}</span>
                  <span className="text-xs/snug text-muted-foreground">{tpl.description}</span>
                </button>
              )
            })}
          </div>
        </section>

        {/* Form */}
        <section className="grid gap-4 rounded-sm border bg-card p-4">
          <Field label="Market title" hint="Plain-language headline. Must be at least 10 characters.">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Will Ethiopia's GDP grow more than 8% in 2026?" />
          </Field>

          <Field label="Binary question" hint="The yes/no question traders see.">
            <Input value={binaryQuestion} onChange={e => setBinaryQuestion(e.target.value)} placeholder="Will Ethiopia's GDP grow more than 8% in 2026?" />
          </Field>

          <Field label="Resolution source" hint="The specific source you'll cite to resolve. Be precise.">
            <Input value={resolutionSource} onChange={e => setResolutionSource(e.target.value)} placeholder="World Bank Open Data, CoinMarketCap, Premier League…" />
          </Field>

          <Field label="Resolution rules" hint="Concrete rules. The review queue rejects vague rules.">
            <textarea
              value={resolutionRules}
              onChange={e => setResolutionRules(e.target.value)}
              rows={5}
              className="
                w-full resize-none rounded-md border border-border/70 bg-background px-3 py-2 text-sm outline-none
                placeholder:text-muted-foreground
                focus:border-primary focus:ring-1 focus:ring-primary
              "
              placeholder="Resolves YES if … by [resolution date], according to [source]. Resolves NO if …"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {resolutionRules.length}
              {' '}
              chars (min 20)
            </p>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Resolution date">
              <Input type="date" value={resolutionDate} onChange={e => setResolutionDate(e.target.value)} />
            </Field>
            <Field label="Image URL (optional)">
              <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…" />
            </Field>
          </div>

          <Field label="Description (optional)" hint="Background to help traders understand the market.">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="
                w-full resize-none rounded-md border border-border/70 bg-background px-3 py-2 text-sm outline-none
                placeholder:text-muted-foreground
                focus:border-primary focus:ring-1 focus:ring-primary
              "
              placeholder="Context, prior data, edge cases…"
            />
          </Field>
        </section>

        {/* AI warnings + questions */}
        {(warnings.length > 0 || clarifyingQuestions.length > 0) && (
          <section className="grid gap-3 rounded-sm border border-amber-500/30 bg-amber-500/5 p-4">
            {warnings.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-amber-700 uppercase">
                  <AlertTriangleIcon className="size-3.5" />
                  AI warnings
                </div>
                <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm text-foreground/80">
                  {warnings.map(w => <li key={w}>{w}</li>)}
                </ul>
              </div>
            )}
            {clarifyingQuestions.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
                  <AlertCircleIcon className="size-3.5" />
                  Worth clarifying
                </div>
                <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm text-foreground/80">
                  {clarifyingQuestions.map(q => <li key={q}>{q}</li>)}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Right: live preview */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Live preview</h2>
          <Link
            href={`/community/${communitySlug}/markets/new?tab=advanced`}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeftIcon className="me-0.5 inline size-3" />
            Advanced (5-step wizard)
          </Link>
        </div>
        <MarketPreview
          title={title}
          binaryQuestion={binaryQuestion}
          resolutionSource={resolutionSource}
          resolutionRules={resolutionRules}
          description={description}
          resolutionDate={resolutionDate}
          imageUrl={imageUrl}
          binaryOutcomeYes={binaryOutcomeYes}
          binaryOutcomeNo={binaryOutcomeNo}
          communityName={communityName}
          communityIcon={communityIcon}
        />

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link href={`/community/${communitySlug}/markets/new?tab=drafts`}>My drafts</Link>
          </Button>
          <Button disabled={!canSaveDraft} onClick={handleSaveDraft}>
            {pending ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
            {pending ? 'Saving…' : 'Save draft'}
          </Button>
        </div>
        <p className="mt-2 text-end text-xs text-muted-foreground">
          Drafts can be edited freely. Submit-for-review starts the super-admin gate.
        </p>
      </aside>
    </div>
  )
}

function Field({ label, hint, children }: { label: string, hint?: string, children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium">{label}</label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
