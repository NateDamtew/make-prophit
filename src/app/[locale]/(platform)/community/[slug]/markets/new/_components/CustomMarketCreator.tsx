'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  HelpCircle,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  Image as ImageIcon,
} from 'lucide-react'
import {
  analyzeMarketAction,
  createMarketDraftAction,
} from '../../../_actions/market-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Props {
  communityId: string
  communitySlug: string
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

interface AISuggestion {
  refined_title: string
  resolution_source: string
  resolution_rules: string
  suggested_resolution_date?: string
  clarifying_questions?: string[]
  warnings?: string[]
}

type Step = 1 | 2 | 3 | 4 | 5
type MarketMode = 'binary' | 'multi_unique' | 'multi_multiple'

const STEPS = [
  { num: 1 as const, label: 'Event' },
  { num: 2 as const, label: 'Market Structure' },
  { num: 3 as const, label: 'Resolution' },
  { num: 4 as const, label: 'Categories' },
  { num: 5 as const, label: 'Review & Submit' },
]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

function StepIndicator({ stepNum, label, current }: { stepNum: number, label: string, current: Step }) {
  const isCompleted = current > stepNum
  const isCurrent = current === stepNum
  return (
    <div className="flex flex-1 flex-col items-start gap-1">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Step {stepNum}
      </p>
      <p
        className={cn(
          'text-sm font-semibold transition-colors',
          isCurrent && 'text-primary',
          isCompleted && 'text-foreground',
          !isCurrent && !isCompleted && 'text-muted-foreground',
        )}
      >
        {label}
      </p>
    </div>
  )
}

export default function CustomMarketCreator({ communityId, communitySlug }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)

  // Step 1: Event
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [resolutionDate, setResolutionDate] = useState('')

  // Step 2: Market Structure
  const [marketMode, setMarketMode] = useState<MarketMode>('binary')
  const [binaryQuestion, setBinaryQuestion] = useState('')
  const [binaryOutcomeYes, setBinaryOutcomeYes] = useState('Yes')
  const [binaryOutcomeNo, setBinaryOutcomeNo] = useState('No')
  const [options, setOptions] = useState<MarketOption[]>([
    { id: '1', question: '', title: '', shortName: '', slug: '' },
    { id: '2', question: '', title: '', shortName: '', slug: '' },
  ])

  // Step 3: Resolution (with optional AI assist)
  const [resolutionSource, setResolutionSource] = useState('')
  const [resolutionRules, setResolutionRules] = useState('')
  const [description, setDescription] = useState('')
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null)
  const [aiContext, setAiContext] = useState('')
  const [isAnalyzing, startAnalyzing] = useTransition()

  // Step 4: Categories
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [mainCategory, setMainCategory] = useState<string>('')
  const [subCategories, setSubCategories] = useState<Set<string>>(new Set())
  const [categoriesLoading, setCategoriesLoading] = useState(false)

  // Step 5
  const [isSaving, startSaving] = useTransition()

  // Load categories on mount
  useEffect(() => {
    setCategoriesLoading(true)
    fetch('/api/categories')
      .then(r => r.ok ? r.json() : { categories: [] })
      .then((data) => {
        setCategories(data.categories ?? [])
      })
      .catch(() => setCategories([]))
      .finally(() => setCategoriesLoading(false))
  }, [])

  // Auto-slug from title
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

  function handleAnalyzeAI() {
    if (!title.trim()) {
      toast.error('Add a market title first (step 1).')
      return
    }
    startAnalyzing(async () => {
      const result = await analyzeMarketAction({
        question: title,
        context: [
          resolutionSource ? `Source preference: ${resolutionSource}` : null,
          aiContext.trim() || null,
        ].filter(Boolean).join('\n') || undefined,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (result.data) {
        setAiSuggestion(result.data)
        // Auto-fill source and rules if empty
        if (!resolutionSource && result.data.resolution_source) {
          setResolutionSource(result.data.resolution_source)
        }
        if (!resolutionRules && result.data.resolution_rules) {
          setResolutionRules(result.data.resolution_rules)
        }
        if (!resolutionDate && result.data.suggested_resolution_date) {
          setResolutionDate(result.data.suggested_resolution_date.slice(0, 10))
        }
      }
    })
  }

  function addOption() {
    setOptions(prev => [
      ...prev,
      { id: String(prev.length + 1), question: '', title: '', shortName: '', slug: '' },
    ])
  }
  function removeOption(id: string) {
    setOptions(prev => prev.filter(o => o.id !== id))
  }
  function updateOption(id: string, patch: Partial<MarketOption>) {
    setOptions(prev => prev.map(o => o.id === id ? {
      ...o,
      ...patch,
      slug: patch.title ? slugify(patch.title) : o.slug,
    } : o))
  }

  function toggleSub(slug: string) {
    setSubCategories((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) {
        next.delete(slug)
      }
      else {
        next.add(slug)
      }
      return next
    })
  }

  const mainCategoryOptions = useMemo(
    () => categories.filter(c => c.isMainCategory),
    [categories],
  )
  const subCategoryOptions = useMemo(
    () => categories.filter(c => !c.isMainCategory),
    [categories],
  )

  // Validation per step
  function validateStep(s: Step): string | null {
    if (s === 1) {
      if (title.trim().length < 10) {
        return 'Title must be at least 10 characters.'
      }
      if (slug.length < 3) {
        return 'Slug must be at least 3 characters.'
      }
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return 'Slug can only contain lowercase letters, numbers, and hyphens.'
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
      else {
        const valid = options.every(o => o.title.trim() && o.question.trim())
        if (!valid || options.length < 2) {
          return 'All options need a title and a question (min 2 options).'
        }
      }
    }
    if (s === 3) {
      if (resolutionRules.trim().length < 20) {
        return 'Resolution rules must be at least 20 characters.'
      }
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

  async function handleSubmit() {
    // Validate all
    for (let s: Step = 1; s <= 5; s++) {
      const err = validateStep(s as Step)
      if (err) {
        toast.error(`Step ${s}: ${err}`)
        setStep(s as Step)
        return
      }
    }

    startSaving(async () => {
      const result = await createMarketDraftAction(communityId, communitySlug, {
        title,
        slug: slug || undefined,
        image_url: imageUrl || undefined,
        description: description || undefined,
        resolution_source: resolutionSource || undefined,
        resolution_rules: resolutionRules,
        resolution_date: resolutionDate || undefined,
        market_mode: marketMode,
        binary_question: marketMode === 'binary' ? binaryQuestion : undefined,
        binary_outcome_yes: marketMode === 'binary' ? binaryOutcomeYes : undefined,
        binary_outcome_no: marketMode === 'binary' ? binaryOutcomeNo : undefined,
        options: marketMode !== 'binary' ? options : undefined,
        main_category_slug: mainCategory,
        category_slugs: Array.from(subCategories),
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Draft saved!', {
        description: 'Find it in the Drafts tab to submit for review.',
      })
      router.replace(`/community/${communitySlug}/markets/new?tab=drafts` as any)
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border bg-card">
      {/* Step indicator bar */}
      <div className="flex gap-2 overflow-x-auto border-b px-5 py-4">
        {STEPS.map(s => (
          <StepIndicator key={s.num} stepNum={s.num} label={s.label} current={step} />
        ))}
      </div>

      {/* STEP 1: Event */}
      {step === 1 && (
        <div className="space-y-5 p-6">
          <div>
            <h2 className="text-lg font-semibold">Event Details</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Basic info for your market. The platform admin will review before deployment.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-[1fr_200px]">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Event title *</label>
                <Input
                  value={title}
                  onChange={e => handleTitleChange(e.target.value)}
                  placeholder="Will Ethiopia's GDP grow more than 8% in 2026?"
                  className="mt-1.5"
                  maxLength={200}
                />
              </div>

              <div>
                <label className="text-sm font-medium">Slug *</label>
                <div className="mt-1.5 flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">prophit.com/event/</span>
                  <input
                    value={slug}
                    onChange={e => handleSlugChange(e.target.value)}
                    className="flex-1 bg-transparent outline-none"
                    placeholder="will-ethiopia-gdp-grow-2026"
                    maxLength={60}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Resolution date *</label>
                <Input
                  type="date"
                  value={resolutionDate}
                  onChange={e => setResolutionDate(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>

            {/* Image upload placeholder */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Event image</label>
              <div className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed bg-muted/30">
                {imageUrl
                  ? <img src={imageUrl} alt="" className="size-full rounded-xl object-cover" />
                  : (
                      <div className="text-center">
                        <ImageIcon className="mx-auto mb-1 size-6 text-muted-foreground/40" />
                        <p className="text-xs text-muted-foreground">256×256</p>
                      </div>
                    )}
              </div>
              <Input
                placeholder="Paste image URL (optional)"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Market Structure */}
      {step === 2 && (
        <div className="space-y-5 p-6">
          <div>
            <h2 className="text-lg font-semibold">Market Structure</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Choose how members will trade on this market.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMarketMode('binary')}
              className={cn(
                'rounded-xl border p-4 text-left transition-all',
                marketMode === 'binary'
                  ? 'border-primary bg-primary/5'
                  : 'hover:border-border/80 hover:bg-muted/30',
              )}
            >
              <p className="font-semibold">Binary (Yes/No)</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                One question, two outcomes.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setMarketMode('multi_unique')}
              className={cn(
                'rounded-xl border p-4 text-left transition-all',
                marketMode !== 'binary'
                  ? 'border-primary bg-primary/5'
                  : 'hover:border-border/80 hover:bg-muted/30',
              )}
            >
              <p className="font-semibold">Multi-option</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Two or more competing outcomes.
              </p>
            </button>
          </div>

          {marketMode === 'binary' && (
            <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
              <div>
                <label className="text-sm font-medium">Question</label>
                <Input
                  value={binaryQuestion}
                  onChange={e => setBinaryQuestion(e.target.value)}
                  placeholder="Will Ethiopia's GDP grow >8% in 2026?"
                  className="mt-1.5 bg-background"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Yes outcome label</label>
                  <Input
                    value={binaryOutcomeYes}
                    onChange={e => setBinaryOutcomeYes(e.target.value)}
                    className="mt-1.5 bg-background"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">No outcome label</label>
                  <Input
                    value={binaryOutcomeNo}
                    onChange={e => setBinaryOutcomeNo(e.target.value)}
                    className="mt-1.5 bg-background"
                  />
                </div>
              </div>
            </div>
          )}

          {marketMode !== 'binary' && (
            <div className="space-y-3">
              {options.map(opt => (
                <div key={opt.id} className="space-y-2 rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Option {opt.id}</p>
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(opt.id)}
                        className="text-xs text-destructive hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <Input
                    placeholder="Title (e.g. Arsenal wins)"
                    value={opt.title}
                    onChange={e => updateOption(opt.id, { title: e.target.value })}
                    className="bg-background"
                  />
                  <Input
                    placeholder="Question (e.g. Will Arsenal win?)"
                    value={opt.question}
                    onChange={e => updateOption(opt.id, { question: e.target.value })}
                    className="bg-background"
                  />
                  <Input
                    placeholder="Short name"
                    value={opt.shortName}
                    onChange={e => updateOption(opt.id, { shortName: e.target.value })}
                    className="bg-background"
                  />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addOption}>
                <Plus className="mr-1.5 size-3.5" />
                Add option
              </Button>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Resolution */}
      {step === 3 && (
        <div className="space-y-5 p-6">
          <div>
            <h2 className="text-lg font-semibold">Resolution</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              How will the outcome be determined? Be specific so the jury can resolve it fairly.
            </p>
          </div>

          {/* Optional AI helper */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-2">
              <Wand2 className="mt-0.5 size-4 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-primary">Ask Gemini AI to draft this</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  AI suggests a specific resolution source + precise rules based on your title.
                </p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <textarea
                value={aiContext}
                onChange={e => setAiContext(e.target.value)}
                placeholder="(Optional) Any constraints or data sources to prefer?"
                rows={2}
                className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAnalyzeAI}
                disabled={isAnalyzing}
              >
                {isAnalyzing
                  ? <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  : <Sparkles className="mr-1.5 size-3.5" />}
                Analyze with AI
              </Button>
            </div>
            {aiSuggestion?.warnings && aiSuggestion.warnings.length > 0 && (
              <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 p-2 text-xs">
                <div className="flex items-center gap-1 font-medium text-destructive">
                  <AlertTriangle className="size-3" /> AI Warnings
                </div>
                <ul className="mt-1 space-y-0.5 text-destructive/80">
                  {aiSuggestion.warnings.map((w, i) => <li key={i}>· {w}</li>)}
                </ul>
              </div>
            )}
            {aiSuggestion?.clarifying_questions && aiSuggestion.clarifying_questions.length > 0 && (
              <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs">
                <div className="flex items-center gap-1 font-medium text-amber-600">
                  <HelpCircle className="size-3" /> Clarify
                </div>
                <ul className="mt-1 space-y-0.5 text-amber-700/90">
                  {aiSuggestion.clarifying_questions.map((q, i) => <li key={i}>· {q}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Resolution source *</label>
            <Input
              value={resolutionSource}
              onChange={e => setResolutionSource(e.target.value)}
              placeholder="World Bank Open Data, CoinMarketCap, Premier League official…"
              className="mt-1.5"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Resolution rules *</label>
            <textarea
              value={resolutionRules}
              onChange={e => setResolutionRules(e.target.value)}
              placeholder="Precise rules that determine each outcome. Include data source, timing, and edge cases."
              rows={6}
              className="mt-1.5 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              maxLength={2000}
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{resolutionRules.length}/2000</p>
          </div>

          <div>
            <label className="text-sm font-medium">
              Description
              <span className="ml-1 font-normal text-muted-foreground">(optional, shown on event page)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              maxLength={1000}
              className="mt-1.5 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              placeholder="Background or context to help traders understand the market."
            />
          </div>
        </div>
      )}

      {/* STEP 4: Categories */}
      {step === 4 && (
        <div className="space-y-5 p-6">
          <div>
            <h2 className="text-lg font-semibold">Categories</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Pick a main category and at least 4 sub-categories.
              This determines where your market shows up across the platform.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Main category *</label>
            {categoriesLoading
              ? <div className="mt-2 h-10 animate-pulse rounded-lg bg-muted" />
              : (
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {mainCategoryOptions.map(cat => (
                      <button
                        key={cat.slug}
                        type="button"
                        onClick={() => setMainCategory(cat.slug)}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-sm transition-all',
                          mainCategory === cat.slug
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'hover:border-border/80 hover:bg-muted/30',
                        )}
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
              <span className={cn(
                'text-xs',
                subCategories.size >= 4 ? 'text-green-600' : 'text-muted-foreground',
              )}
              >
                {subCategories.size}/4 minimum
              </span>
            </div>
            {categoriesLoading
              ? <div className="mt-2 h-32 animate-pulse rounded-lg bg-muted" />
              : (
                  <div className="mt-2 flex max-h-64 flex-wrap gap-1.5 overflow-y-auto rounded-lg border p-3">
                    {subCategoryOptions.map(cat => (
                      <button
                        key={cat.slug}
                        type="button"
                        onClick={() => toggleSub(cat.slug)}
                        className={cn(
                          'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-all',
                          subCategories.has(cat.slug)
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'hover:border-border/80 hover:bg-muted/50',
                        )}
                      >
                        {subCategories.has(cat.slug) && <Check className="size-3" />}
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}
          </div>
        </div>
      )}

      {/* STEP 5: Review & Submit */}
      {step === 5 && (
        <div className="space-y-5 p-6">
          <div>
            <h2 className="text-lg font-semibold">Review & Submit</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Confirm everything looks right. After saving, you can submit for platform admin review.
            </p>
          </div>

          <div className="space-y-3 rounded-xl border bg-muted/20 p-5">
            <div className="flex items-start justify-between gap-4">
              {imageUrl && (
                <img src={imageUrl} alt="" className="size-16 rounded-xl object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Title</p>
                <p className="mt-0.5 font-semibold leading-snug">{title}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">prophit.com/event/{slug}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Resolves</p>
                <p className="font-medium">{resolutionDate ? new Date(resolutionDate).toLocaleDateString() : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Market Mode</p>
                <p className="font-medium capitalize">{marketMode.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Main Category</p>
                <p className="font-medium">{mainCategory || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sub-categories</p>
                <p className="font-medium">{subCategories.size}</p>
              </div>
            </div>

            {resolutionSource && (
              <div className="border-t pt-3 text-sm">
                <p className="text-xs text-muted-foreground">Resolution Source</p>
                <p className="font-medium">{resolutionSource}</p>
              </div>
            )}

            {resolutionRules && (
              <div className="border-t pt-3 text-sm">
                <p className="text-xs text-muted-foreground">Resolution Rules</p>
                <p className="mt-0.5 whitespace-pre-wrap text-foreground/90">{resolutionRules}</p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
            After saving, head to the Drafts tab and click <strong>Submit for Review</strong>.
            A platform admin will then approve and deploy your market on-chain (~5–15 min).
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3 border-t p-4">
        {step > 1
          ? (
              <Button variant="outline" onClick={handleBack} disabled={isSaving}>
                <ChevronLeft className="mr-1 size-4" />
                Back
              </Button>
            )
          : <div />}

        {step < 5
          ? (
              <Button onClick={handleNext}>
                Next
                <ChevronRight className="ml-1 size-4" />
              </Button>
            )
          : (
              <Button onClick={handleSubmit} disabled={isSaving}>
                {isSaving
                  ? <Loader2 className="mr-2 size-4 animate-spin" />
                  : <Sparkles className="mr-2 size-4" />}
                Save Draft
              </Button>
            )}
      </div>
    </div>
  )
}
