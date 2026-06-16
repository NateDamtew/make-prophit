'use client'

import type { MarketSuggestion } from '@/lib/ai/gemini'
import type { MarketTemplateId } from '@/lib/communities/market-templates'
import type { ExtractedUrlContent } from '@/lib/communities/url-ingest'
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  FileTextIcon,
  LinkIcon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  SendIcon,
  SparklesIcon,
  WandSparklesIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { MARKET_TEMPLATES } from '@/lib/communities/market-templates'
import { cn } from '@/lib/utils'
import { analyzeMarketAction, createMarketDraftAction } from '../../../_actions/market-actions'
import { submitMarketForReviewAction } from '../../../_actions/review-actions'
import { MarketPreview } from './MarketPreview'

interface Props {
  communityId: string
  communitySlug: string
  communityName: string
  communityIcon: string | null
}

interface CategoryOption {
  slug: string
  name: string
  isMainCategory: boolean
}

interface MarketOption {
  id: string
  question: string
  title: string
  shortName: string
  slug: string
}

type Step = 1 | 2 | 3 | 4 | 5
type MarketMode = 'binary' | 'multi_unique' | 'multi_multiple'

const STEPS: { num: Step, label: string, hint: string }[] = [
  { num: 1, label: 'Event', hint: 'Title, slug, image, date' },
  { num: 2, label: 'Market structure', hint: 'Binary / multi-outcome' },
  { num: 3, label: 'Resolution', hint: 'Source & rules' },
  { num: 4, label: 'Categories', hint: 'Tag for discovery' },
  { num: 5, label: 'Review & Submit', hint: 'Final check' },
]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function MarketWizard({ communityId, communitySlug, communityName, communityIcon }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Step 1: Event
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [resolutionDate, setResolutionDate] = useState('')

  // Step 1: AI drafter
  const [promptMode, setPromptMode] = useState<'prompt' | 'url'>('prompt')
  const [prompt, setPrompt] = useState('')
  const [isAiBusy, setAiBusy] = useState(false)
  const [activeTemplate, setActiveTemplate] = useState<MarketTemplateId | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [clarifyingQuestions, setClarifyingQuestions] = useState<string[]>([])

  // Step 2: Market structure
  const [marketMode, setMarketMode] = useState<MarketMode>('binary')
  const [binaryQuestion, setBinaryQuestion] = useState('')
  const [binaryOutcomeYes, setBinaryOutcomeYes] = useState('Yes')
  const [binaryOutcomeNo, setBinaryOutcomeNo] = useState('No')
  const [options, setOptions] = useState<MarketOption[]>([
    { id: '1', question: '', title: '', shortName: '', slug: '' },
    { id: '2', question: '', title: '', shortName: '', slug: '' },
  ])

  // Step 3: Resolution
  const [resolutionSource, setResolutionSource] = useState('')
  const [resolutionRules, setResolutionRules] = useState('')
  const [description, setDescription] = useState('')

  // Step 4: Categories
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [mainCategory, setMainCategory] = useState('')
  const [subCategories, setSubCategories] = useState<Set<string>>(new Set())
  const [categoriesLoading, setCategoriesLoading] = useState(false)

  const [isSaving, startSaving] = useTransition()
  const [isSubmitting, startSubmitting] = useTransition()

  useEffect(() => {
    setCategoriesLoading(true)
    fetch('/api/categories')
      .then(r => r.ok ? r.json() : { categories: [] })
      .then(data => setCategories(data.categories ?? []))
      .catch(() => setCategories([]))
      .finally(() => setCategoriesLoading(false))
  }, [])

  const mainCategoryOptions = useMemo(() => categories.filter(c => c.isMainCategory), [categories])
  const subCategoryOptions = useMemo(() => categories.filter(c => !c.isMainCategory), [categories])

  function handleTitleChange(value: string) {
    setTitle(value)
    if (marketMode === 'binary' && !binaryQuestion) {
      setBinaryQuestion(value)
    }
    if (!slugEdited) {
      setSlug(slugify(value))
    }
  }

  function handleSlugChange(value: string) {
    setSlugEdited(true)
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
  }

  function applySuggestion(suggestion: MarketSuggestion, sourceUrl?: string) {
    if (suggestion.refined_title) {
      setTitle(suggestion.refined_title)
      if (!slugEdited) {
        setSlug(slugify(suggestion.refined_title))
      }
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
      if (!slugEdited) {
        setSlug(slugify(tpl.binary_question_pattern))
      }
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
      description: 'Replace the bracketed placeholders, then refine with AI.',
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
          if (!title) {
            handleTitleChange(source.title)
          }
          toast.success('Pulled the headline; finish the rest by hand or retry the AI.')
        }
      }
      else {
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

  function addOption() {
    setOptions(prev => [...prev, { id: String(prev.length + 1), question: '', title: '', shortName: '', slug: '' }])
  }
  function removeOption(id: string) {
    setOptions(prev => prev.filter(o => o.id !== id))
  }
  function updateOption(id: string, patch: Partial<MarketOption>) {
    setOptions(prev => prev.map(o => o.id === id ? { ...o, ...patch, slug: patch.title ? slugify(patch.title) : o.slug } : o))
  }
  function toggleSub(slugValue: string) {
    setSubCategories((prev) => {
      const next = new Set(prev)
      if (next.has(slugValue)) {
        next.delete(slugValue)
      }
      else {
        next.add(slugValue)
      }
      return next
    })
  }

  function validateStep(s: Step): string | null {
    if (s === 1) {
      if (title.trim().length < 10) {
        return 'Title must be at least 10 characters.'
      }
      if (slug.length < 3 || !/^[a-z0-9-]+$/.test(slug)) {
        return 'Slug must be at least 3 characters (letters, numbers, hyphens).'
      }
      if (!resolutionDate) {
        return 'Resolution date is required.'
      }
      const date = new Date(resolutionDate)
      if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
        return 'Resolution date must be in the future.'
      }
    }
    if (s === 2) {
      if (marketMode === 'binary') {
        if (!binaryQuestion.trim() || !binaryOutcomeYes.trim() || !binaryOutcomeNo.trim()) {
          return 'Question and both outcome labels are required.'
        }
      }
      else if (options.length < 2 || !options.every(o => o.title.trim() && o.question.trim())) {
        return 'All options need a title and a question (min 2 options).'
      }
    }
    if (s === 3 && resolutionRules.trim().length < 20) {
      return 'Resolution rules must be at least 20 characters.'
    }
    if (s === 4) {
      if (!mainCategory) {
        return 'Pick a main category.'
      }
      if (subCategories.size < 4) {
        return `Pick at least 4 sub-categories (you have ${subCategories.size}).`
      }
    }
    return null
  }

  function gotoStep(target: Step) {
    // Allow moving back freely; moving forward validates the steps in between.
    if (target <= step) {
      setStep(target)
      return
    }
    for (let s = step; s < target; s++) {
      const err = validateStep(s as Step)
      if (err) {
        toast.error(err)
        setStep(s as Step)
        return
      }
    }
    setStep(target)
  }

  function handleNext() {
    const err = validateStep(step)
    if (err) {
      toast.error(err)
      return
    }
    setStep(s => (s < 5 ? s + 1 : s) as Step)
  }

  function handleBack() {
    setStep(s => (s > 1 ? s - 1 : s) as Step)
  }

  function buildDraftInput() {
    return {
      title: title.trim(),
      slug: slug || undefined,
      image_url: imageUrl.trim() || undefined,
      description: description.trim() || undefined,
      resolution_source: resolutionSource.trim() || undefined,
      resolution_rules: resolutionRules.trim(),
      resolution_date: resolutionDate || undefined,
      market_mode: marketMode,
      binary_question: marketMode === 'binary' ? binaryQuestion.trim() : undefined,
      binary_outcome_yes: marketMode === 'binary' ? binaryOutcomeYes : undefined,
      binary_outcome_no: marketMode === 'binary' ? binaryOutcomeNo : undefined,
      options: marketMode !== 'binary' ? options : undefined,
      main_category_slug: mainCategory || undefined,
      category_slugs: subCategories.size > 0 ? Array.from(subCategories) : undefined,
    }
  }

  function validateMinimumForDraft(): string | null {
    if (title.trim().length < 10) {
      return 'Add a title of at least 10 characters before saving.'
    }
    if (resolutionRules.trim().length < 20) {
      return 'Add resolution rules (at least 20 characters) before saving.'
    }
    return null
  }

  function handleSaveDraft() {
    const err = validateMinimumForDraft()
    if (err) {
      toast.error(err)
      setStep(title.trim().length < 10 ? 1 : 3)
      return
    }
    startSaving(async () => {
      const result = await createMarketDraftAction(communityId, communitySlug, buildDraftInput())
      if (result.error || !result.data) {
        toast.error(result.error ?? 'Could not save draft.')
        return
      }
      toast.success('Draft saved. Submit for review when you\'re ready.')
      router.replace(`/community/${communitySlug}/markets/new?tab=drafts` as any)
      router.refresh()
    })
  }

  function handleSubmitForReview() {
    for (let s: Step = 1; s <= 5; s++) {
      const err = validateStep(s as Step)
      if (err) {
        toast.error(`Step ${s}: ${err}`)
        setStep(s as Step)
        return
      }
    }
    startSubmitting(async () => {
      const draft = await createMarketDraftAction(communityId, communitySlug, buildDraftInput())
      if (draft.error || !draft.data?.id) {
        toast.error(draft.error ?? 'Could not save the draft.')
        return
      }
      const submitted = await submitMarketForReviewAction(draft.data.id, communityId, communitySlug, {
        mainCategorySlug: mainCategory,
        categorySlugs: Array.from(subCategories),
      })
      if (submitted.error) {
        toast.error(submitted.error, { description: 'Saved as a draft — submit again from Drafts.' })
        router.replace(`/community/${communitySlug}/markets/new?tab=drafts` as any)
        router.refresh()
        return
      }
      toast.success('Submitted for review', {
        description: 'A platform admin will review your market shortly.',
      })
      router.replace(`/community/${communitySlug}` as any)
      router.refresh()
    })
  }

  const busy = isSaving || isSubmitting

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      {/* Action header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <p className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
          <span className="rounded-sm bg-primary px-1.5 py-0.5 text-primary-foreground">New market</span>
          <span className="ml-2">{communityName}</span>
          <span className="ml-2 opacity-60">· Draft</span>
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <EyeIcon className="mr-1.5 size-3.5" />
            Preview
          </Button>
          <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={busy}>
            {isSaving ? <Loader2Icon className="mr-1.5 size-3.5 animate-spin" /> : <SaveIcon className="mr-1.5 size-3.5" />}
            Save draft
          </Button>
          <Button size="sm" onClick={handleSubmitForReview} disabled={busy}>
            {isSubmitting
              ? <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />
              : (
                  <SendIcon className="mr-1.5 size-3.5" />
                )}
            Submit for review
          </Button>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* Progress rail */}
        <nav className="border-b p-4 lg:border-r lg:border-b-0">
          <p className="
            mb-3 flex items-center justify-between text-2xs font-semibold tracking-wider text-muted-foreground uppercase
          "
          >
            Progress
            <span>
              {step}
              /5
            </span>
          </p>
          <ol className="grid gap-1.5">
            {STEPS.map((s) => {
              const isCurrent = step === s.num
              const isDone = step > s.num
              return (
                <li key={s.num}>
                  <button
                    type="button"
                    onClick={() => gotoStep(s.num)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg border p-2.5 text-left transition-colors',
                      isCurrent ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/40',
                    )}
                  >
                    <span className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-md text-2xs font-bold',
                      isCurrent && 'bg-primary text-primary-foreground',
                      isDone && 'bg-primary/20 text-primary',
                      !isCurrent && !isDone && 'bg-muted text-muted-foreground',
                    )}
                    >
                      {isDone ? <CheckIcon className="size-3.5" /> : s.num}
                    </span>
                    <span className="min-w-0">
                      <span className={cn('block text-sm font-semibold', isCurrent
                        ? 'text-foreground'
                        : `text-foreground/80`)}
                      >
                        {s.label}
                      </span>
                      <span className="block text-2xs text-muted-foreground">{s.hint}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        {/* Step content */}
        <div className="min-w-0">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-muted-foreground">
                Step
                {' '}
                {step}
                {' '}
                ·
              </span>
              {STEPS[step - 1].label}
            </h2>
            <span className="hidden text-2xs tracking-wider text-muted-foreground uppercase sm:block">
              {STEPS[step - 1].hint}
            </span>
          </div>

          <div className="p-5 sm:p-6">
            {step === 1 && (
              <StepEvent
                promptMode={promptMode}
                setPromptMode={setPromptMode}
                prompt={prompt}
                setPrompt={setPrompt}
                isAiBusy={isAiBusy}
                runAi={runAi}
                activeTemplate={activeTemplate}
                applyTemplate={applyTemplate}
                title={title}
                onTitleChange={handleTitleChange}
                slug={slug}
                onSlugChange={handleSlugChange}
                resolutionDate={resolutionDate}
                setResolutionDate={setResolutionDate}
                imageUrl={imageUrl}
                setImageUrl={setImageUrl}
                warnings={warnings}
                clarifyingQuestions={clarifyingQuestions}
              />
            )}
            {step === 2 && (
              <StepStructure
                marketMode={marketMode}
                setMarketMode={setMarketMode}
                binaryQuestion={binaryQuestion}
                setBinaryQuestion={setBinaryQuestion}
                binaryOutcomeYes={binaryOutcomeYes}
                setBinaryOutcomeYes={setBinaryOutcomeYes}
                binaryOutcomeNo={binaryOutcomeNo}
                setBinaryOutcomeNo={setBinaryOutcomeNo}
                options={options}
                addOption={addOption}
                removeOption={removeOption}
                updateOption={updateOption}
              />
            )}
            {step === 3 && (
              <StepResolution
                resolutionSource={resolutionSource}
                setResolutionSource={setResolutionSource}
                resolutionRules={resolutionRules}
                setResolutionRules={setResolutionRules}
                description={description}
                setDescription={setDescription}
              />
            )}
            {step === 4 && (
              <StepCategories
                loading={categoriesLoading}
                mainCategoryOptions={mainCategoryOptions}
                subCategoryOptions={subCategoryOptions}
                mainCategory={mainCategory}
                setMainCategory={setMainCategory}
                subCategories={subCategories}
                toggleSub={toggleSub}
              />
            )}
            {step === 5 && (
              <StepReview
                title={title}
                slug={slug}
                imageUrl={imageUrl}
                resolutionDate={resolutionDate}
                marketMode={marketMode}
                mainCategory={mainCategory}
                subCount={subCategories.size}
                resolutionSource={resolutionSource}
                resolutionRules={resolutionRules}
              />
            )}
          </div>

          {/* Step nav */}
          <div className="flex items-center justify-between gap-3 border-t p-4">
            {step > 1
              ? (
                  <Button variant="outline" onClick={handleBack} disabled={busy}>
                    <ChevronLeftIcon className="mr-1 size-4" />
                    Back
                  </Button>
                )
              : <div />}
            {step < 5
              ? (
                  <Button onClick={handleNext}>
                    Next
                    <ChevronRightIcon className="ml-1 size-4" />
                  </Button>
                )
              : (
                  <Button onClick={handleSubmitForReview} disabled={busy}>
                    {isSubmitting
                      ? <Loader2Icon className="mr-1.5 size-4 animate-spin" />
                      : (
                          <SendIcon className="mr-1.5 size-4" />
                        )}
                    Submit for review
                  </Button>
                )}
          </div>
        </div>
      </div>

      {/* Preview modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Market preview</DialogTitle>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Step 1: Event ──────────────────────────────────────────────────────────

function StepEvent(props: {
  promptMode: 'prompt' | 'url'
  setPromptMode: (m: 'prompt' | 'url') => void
  prompt: string
  setPrompt: (v: string) => void
  isAiBusy: boolean
  runAi: () => void
  activeTemplate: MarketTemplateId | null
  applyTemplate: (id: MarketTemplateId) => void
  title: string
  onTitleChange: (v: string) => void
  slug: string
  onSlugChange: (v: string) => void
  resolutionDate: string
  setResolutionDate: (v: string) => void
  imageUrl: string
  setImageUrl: (v: string) => void
  warnings: string[]
  clarifyingQuestions: string[]
}) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* AI drafter */}
        <section className="rounded-xl border bg-background p-4">
          <header className="mb-3 flex items-center gap-2">
            <WandSparklesIcon className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">AI market drafter</h3>
            <span className="ms-auto text-2xs tracking-wider text-muted-foreground uppercase">Gemini</span>
          </header>
          <div className="mb-2 flex gap-1.5">
            <ModeChip icon={FileTextIcon} label="From prompt" active={props.promptMode === 'prompt'} onClick={() => props.setPromptMode('prompt')} />
            <ModeChip icon={LinkIcon} label="From URL" active={props.promptMode === 'url'} onClick={() => props.setPromptMode('url')} />
          </div>
          <textarea
            value={props.prompt}
            onChange={e => props.setPrompt(e.target.value)}
            rows={3}
            placeholder={props.promptMode === 'url'
              ? 'Paste a news article, Reuters / AP link, GitHub release URL…'
              : 'e.g. Will Ethiopia\'s central bank cut rates before Q3 2026?'}
            className="
              w-full resize-none rounded-md border border-border/70 bg-card px-3 py-2 text-sm outline-none
              placeholder:text-muted-foreground
              focus:border-primary focus:ring-1 focus:ring-primary
            "
          />
          <Button className="mt-3 w-full" onClick={props.runAi} disabled={props.isAiBusy || props.prompt.trim().length < 5}>
            {props.isAiBusy
              ? <Loader2Icon className="mr-1.5 size-4 animate-spin" />
              : (
                  <WandSparklesIcon className="mr-1.5 size-4" />
                )}
            {props.isAiBusy ? 'Drafting…' : 'Draft with AI'}
          </Button>
          <p className="mt-2 text-2xs text-muted-foreground">
            The AI fills the form below. You always review before saving — and the super-admin reviews before publishing.
          </p>
        </section>

        {/* Templates */}
        <section className="rounded-xl border bg-background p-4">
          <header className="mb-3 flex items-center gap-2">
            <SparklesIcon className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Start from a template</h3>
            <span className="ms-auto text-2xs tracking-wider text-muted-foreground uppercase">
              {MARKET_TEMPLATES.length}
              {' '}
              presets
            </span>
          </header>
          <div className="grid grid-cols-2 gap-2">
            {MARKET_TEMPLATES.map((tpl) => {
              const Icon = tpl.icon
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => props.applyTemplate(tpl.id)}
                  className={cn(
                    'group flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition-colors',
                    props.activeTemplate === tpl.id ? 'border-primary' : 'border-border hover:border-primary/40',
                  )}
                >
                  <Icon className="size-4 text-primary" />
                  <span className="text-xs font-semibold">{tpl.name}</span>
                  <span className="line-clamp-2 text-2xs leading-snug text-muted-foreground">{tpl.description}</span>
                </button>
              )
            })}
          </div>
        </section>
      </div>

      {(props.warnings.length > 0 || props.clarifyingQuestions.length > 0) && (
        <AiNotes warnings={props.warnings} clarifying={props.clarifyingQuestions} />
      )}

      {/* Fields */}
      <div className="grid gap-4">
        <Field label="Event title" hint="Plain-language headline.">
          <Input value={props.title} onChange={e => props.onTitleChange(e.target.value)} placeholder="Will Ethiopia's GDP grow more than 8% in 2026?" maxLength={200} />
        </Field>
        <Field label="Slug" hint="Auto-generated; edit if needed.">
          <div className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-3 py-2 text-sm">
            <span className="text-muted-foreground">/event/</span>
            <input
              value={props.slug}
              onChange={e => props.onSlugChange(e.target.value)}
              className="flex-1 bg-transparent outline-none"
              placeholder="will-ethiopia-gdp-grow-2026"
              maxLength={60}
            />
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Resolution date" hint="When this resolves.">
            <Input type="date" value={props.resolutionDate} onChange={e => props.setResolutionDate(e.target.value)} />
          </Field>
          <Field label="Image URL" hint="Optional cover.">
            <Input value={props.imageUrl} onChange={e => props.setImageUrl(e.target.value)} placeholder="https://…" />
          </Field>
        </div>
      </div>
    </div>
  )
}

// ─── Step 2: Structure ──────────────────────────────────────────────────────

function StepStructure(props: {
  marketMode: MarketMode
  setMarketMode: (m: MarketMode) => void
  binaryQuestion: string
  setBinaryQuestion: (v: string) => void
  binaryOutcomeYes: string
  setBinaryOutcomeYes: (v: string) => void
  binaryOutcomeNo: string
  setBinaryOutcomeNo: (v: string) => void
  options: MarketOption[]
  addOption: () => void
  removeOption: (id: string) => void
  updateOption: (id: string, patch: Partial<MarketOption>) => void
}) {
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => props.setMarketMode('binary')}
          className={cn('rounded-xl border p-4 text-left transition-all', props.marketMode === 'binary'
            ? `border-primary bg-primary/5`
            : `hover:border-border/80 hover:bg-muted/30`)}
        >
          <p className="font-semibold">Binary (Yes/No)</p>
          <p className="mt-0.5 text-xs text-muted-foreground">One question, two outcomes.</p>
        </button>
        <button
          type="button"
          onClick={() => props.setMarketMode('multi_unique')}
          className={cn('rounded-xl border p-4 text-left transition-all', props.marketMode !== 'binary'
            ? `border-primary bg-primary/5`
            : `hover:border-border/80 hover:bg-muted/30`)}
        >
          <p className="font-semibold">Multi-option</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Two or more competing outcomes.</p>
        </button>
      </div>

      {props.marketMode === 'binary'
        ? (
            <div className="grid gap-4 rounded-xl border bg-muted/30 p-4">
              <Field label="Question">
                <Input
                  value={props.binaryQuestion}
                  onChange={e => props.setBinaryQuestion(e.target.value)}
                  className="bg-background"
                  placeholder="Will Ethiopia's GDP grow >8% in 2026?"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Yes outcome label">
                  <Input
                    value={props.binaryOutcomeYes}
                    onChange={e => props.setBinaryOutcomeYes(e.target.value)}
                    className="bg-background"
                  />
                </Field>
                <Field label="No outcome label">
                  <Input
                    value={props.binaryOutcomeNo}
                    onChange={e => props.setBinaryOutcomeNo(e.target.value)}
                    className="bg-background"
                  />
                </Field>
              </div>
            </div>
          )
        : (
            <div className="grid gap-3">
              {props.options.map(opt => (
                <div key={opt.id} className="grid gap-2 rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Option
                      {' '}
                      {opt.id}
                    </p>
                    {props.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => props.removeOption(opt.id)}
                        className="text-xs text-destructive hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <Input
                    placeholder="Title (e.g. Arsenal wins)"
                    value={opt.title}
                    onChange={e => props.updateOption(opt.id, { title: e.target.value })}
                    className="bg-background"
                  />
                  <Input
                    placeholder="Question (e.g. Will Arsenal win?)"
                    value={opt.question}
                    onChange={e => props.updateOption(opt.id, { question: e.target.value })}
                    className="bg-background"
                  />
                  <Input
                    placeholder="Short name"
                    value={opt.shortName}
                    onChange={e => props.updateOption(opt.id, { shortName: e.target.value })}
                    className="bg-background"
                  />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={props.addOption}>
                <PlusIcon className="mr-1.5 size-3.5" />
                Add option
              </Button>
            </div>
          )}
    </div>
  )
}

// ─── Step 3: Resolution ─────────────────────────────────────────────────────

function StepResolution(props: {
  resolutionSource: string
  setResolutionSource: (v: string) => void
  resolutionRules: string
  setResolutionRules: (v: string) => void
  description: string
  setDescription: (v: string) => void
}) {
  return (
    <div className="grid gap-4">
      <Field label="Resolution source" hint="The specific source you'll cite. Be precise.">
        <Input value={props.resolutionSource} onChange={e => props.setResolutionSource(e.target.value)} placeholder="World Bank Open Data, CoinMarketCap, Premier League…" />
      </Field>
      <Field label="Resolution rules" hint="Concrete rules. The review queue rejects vague rules.">
        <textarea
          value={props.resolutionRules}
          onChange={e => props.setResolutionRules(e.target.value)}
          rows={6}
          maxLength={2000}
          className="
            w-full resize-none rounded-md border border-border/70 bg-background px-3 py-2 text-sm outline-none
            placeholder:text-muted-foreground
            focus:border-primary focus:ring-1 focus:ring-primary
          "
          placeholder="Resolves YES if … by [resolution date], according to [source]. Resolves NO if …"
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {props.resolutionRules.length}
          /2000
        </p>
      </Field>
      <Field label="Description" hint="Optional. Shown on the event page.">
        <textarea
          value={props.description}
          onChange={e => props.setDescription(e.target.value)}
          rows={3}
          maxLength={1000}
          className="
            w-full resize-none rounded-md border border-border/70 bg-background px-3 py-2 text-sm outline-none
            placeholder:text-muted-foreground
            focus:border-primary focus:ring-1 focus:ring-primary
          "
          placeholder="Background, prior data, edge cases…"
        />
      </Field>
    </div>
  )
}

// ─── Step 4: Categories ─────────────────────────────────────────────────────

function StepCategories(props: {
  loading: boolean
  mainCategoryOptions: CategoryOption[]
  subCategoryOptions: CategoryOption[]
  mainCategory: string
  setMainCategory: (v: string) => void
  subCategories: Set<string>
  toggleSub: (slug: string) => void
}) {
  return (
    <div className="grid gap-5">
      <div>
        <label className="text-sm font-medium">Main category *</label>
        {props.loading
          ? <div className="mt-2 h-10 animate-pulse rounded-lg bg-muted" />
          : (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {props.mainCategoryOptions.map(cat => (
                  <button
                    key={cat.slug}
                    type="button"
                    onClick={() => props.setMainCategory(cat.slug)}
                    className={cn('rounded-lg border px-3 py-2 text-sm transition-all', props.mainCategory === cat.slug
                      ? `border-primary bg-primary/5 text-primary`
                      : `hover:border-border/80 hover:bg-muted/30`)}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Sub-categories *</label>
          <span className={cn('text-xs', props.subCategories.size >= 4 ? 'text-green-600' : 'text-muted-foreground')}>
            {props.subCategories.size}
            /4 minimum
          </span>
        </div>
        {props.loading
          ? <div className="mt-2 h-32 animate-pulse rounded-lg bg-muted" />
          : (
              <div className="mt-2 flex max-h-64 flex-wrap gap-1.5 overflow-y-auto rounded-lg border p-3">
                {props.subCategoryOptions.map(cat => (
                  <button
                    key={cat.slug}
                    type="button"
                    onClick={() => props.toggleSub(cat.slug)}
                    className={cn('flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-all', props.subCategories.has(cat.slug)
                      ? `border-primary bg-primary text-primary-foreground`
                      : `hover:border-border/80 hover:bg-muted/50`)}
                  >
                    {props.subCategories.has(cat.slug) && <CheckIcon className="size-3" />}
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
      </div>
    </div>
  )
}

// ─── Step 5: Review ─────────────────────────────────────────────────────────

function StepReview(props: {
  title: string
  slug: string
  imageUrl: string
  resolutionDate: string
  marketMode: MarketMode
  mainCategory: string
  subCount: number
  resolutionSource: string
  resolutionRules: string
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-xl border bg-muted/20 p-5">
        <div className="flex items-start gap-4">
          {props.imageUrl && <img src={props.imageUrl} alt="" className="size-16 rounded-xl object-cover" />}
          <div className="min-w-0 flex-1">
            <p className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">Title</p>
            <p className="mt-0.5 leading-snug font-semibold">{props.title}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              /event/
              {props.slug}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
          <ReviewCell label="Resolves" value={props.resolutionDate ? new Date(props.resolutionDate).toLocaleDateString() : '—'} />
          <ReviewCell label="Structure" value={props.marketMode === 'binary' ? 'Binary' : 'Multi-option'} />
          <ReviewCell label="Main category" value={props.mainCategory || '—'} />
          <ReviewCell label="Sub-categories" value={String(props.subCount)} />
        </div>
        {props.resolutionSource && (
          <div className="border-t pt-3 text-sm">
            <p className="text-2xs text-muted-foreground">Resolution source</p>
            <p className="font-medium">{props.resolutionSource}</p>
          </div>
        )}
        {props.resolutionRules && (
          <div className="border-t pt-3 text-sm">
            <p className="text-2xs text-muted-foreground">Resolution rules</p>
            <p className="mt-0.5 whitespace-pre-wrap text-foreground/90">{props.resolutionRules}</p>
          </div>
        )}
      </div>
      <div className="
        rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700
        dark:text-amber-400
      "
      >
        <strong>Submit for review</strong>
        {' '}
        saves this draft and sends it to a platform admin, who approves and deploys it on-chain (~5–15 min).
        Use
        {' '}
        <strong>Save draft</strong>
        {' '}
        to keep editing later.
      </div>
    </div>
  )
}

// ─── Shared bits ────────────────────────────────────────────────────────────

function ReviewCell({ label, value }: { label: string, value: string }) {
  return (
    <div>
      <p className="text-2xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}

function ModeChip({ icon: Icon, label, active, onClick }: { icon: typeof FileTextIcon, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : `border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground`,
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}

function AiNotes({ warnings, clarifying }: { warnings: string[], clarifying: string[] }) {
  return (
    <section className="grid gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      {warnings.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-2xs font-semibold tracking-wide text-amber-700 uppercase">
            <AlertTriangleIcon className="size-3.5" />
            AI warnings
          </div>
          <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm text-foreground/80">
            {warnings.map(w => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}
      {clarifying.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-2xs font-semibold tracking-wide text-primary uppercase">
            <AlertCircleIcon className="size-3.5" />
            Worth clarifying
          </div>
          <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm text-foreground/80">
            {clarifying.map(q => <li key={q}>{q}</li>)}
          </ul>
        </div>
      )}
    </section>
  )
}

function Field({ label, hint, children }: { label: string, hint?: string, children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium">{label}</label>
        {hint && <span className="text-2xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
