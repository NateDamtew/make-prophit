'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Sparkles,
  AlertTriangle,
  HelpCircle,
  Check,
  Loader2,
  Save,
  Wand2,
} from 'lucide-react'
import { analyzeMarketAction, createMarketDraftAction } from '../../../_actions/market-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Props {
  communityId: string
  communitySlug: string
}

interface Suggestion {
  refined_title: string
  resolution_source: string
  resolution_rules: string
  suggested_resolution_date?: string
  clarifying_questions?: string[]
  warnings?: string[]
}

type Stage = 'question' | 'review' | 'edit'

export default function CustomMarketCreator({ communityId, communitySlug }: Props) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('question')

  // Stage 1: Question
  const [question, setQuestion] = useState('')
  const [context, setContext] = useState('')
  const [isAnalyzing, startAnalyzing] = useTransition()
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)

  // Stage 2/3: Edit & save
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [resolutionSource, setResolutionSource] = useState('')
  const [resolutionRules, setResolutionRules] = useState('')
  const [resolutionDate, setResolutionDate] = useState('')
  const [isSaving, startSaving] = useTransition()

  function handleAnalyze() {
    if (question.trim().length < 5) {
      toast.error('Please write a market question first.')
      return
    }
    startAnalyzing(async () => {
      const result = await analyzeMarketAction({ question, context: context || undefined })
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (result.data) {
        setSuggestion(result.data)
        setTitle(result.data.refined_title)
        setResolutionSource(result.data.resolution_source)
        setResolutionRules(result.data.resolution_rules)
        if (result.data.suggested_resolution_date) {
          setResolutionDate(result.data.suggested_resolution_date.slice(0, 10))
        }
        setStage('review')
      }
    })
  }

  function handleSkipAi() {
    setTitle(question)
    setStage('edit')
  }

  async function handleSaveDraft() {
    startSaving(async () => {
      const result = await createMarketDraftAction(communityId, communitySlug, {
        title,
        description: description || undefined,
        resolution_source: resolutionSource || undefined,
        resolution_rules: resolutionRules,
        resolution_date: resolutionDate || undefined,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Saved as draft', {
        description: 'Submit it for review from the Drafts tab when ready.',
      })
      router.refresh()
      router.push(`/community/${communitySlug}` as any)
    })
  }

  // STAGE 1: Question input
  if (stage === 'question') {
    return (
      <div className="space-y-5 rounded-2xl border bg-card p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wand2 className="size-4" />
          </div>
          <div>
            <h2 className="font-semibold">Describe your market</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Write a question — Gemini will refine it and suggest resolution criteria.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Market Question *</label>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="e.g. Will Ethiopia's GDP grow more than 8% in 2026?"
            className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
            rows={3}
            maxLength={500}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Additional Context
            <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder="Any specific data sources, deadlines, or constraints to consider?"
            className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
            rows={2}
            maxLength={500}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleSkipAi}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip AI assistance
          </button>
          <Button onClick={handleAnalyze} disabled={isAnalyzing}>
            {isAnalyzing
              ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Analyzing...
                  </>
                )
              : (
                  <>
                    <Sparkles className="mr-2 size-4" />
                    Analyze with AI
                  </>
                )}
          </Button>
        </div>
      </div>
    )
  }

  // STAGE 2: Review AI suggestions
  if (stage === 'review' && suggestion) {
    return (
      <div className="space-y-4">
        {/* AI suggestion summary */}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <p className="text-sm font-semibold text-primary">AI Refined Your Market</p>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Refined Title</p>
              <p className="mt-0.5 font-medium">{suggestion.refined_title}</p>
            </div>
            {suggestion.resolution_source && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Resolution Source</p>
                <p className="mt-0.5">{suggestion.resolution_source}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground">Resolution Rules</p>
              <p className="mt-0.5 whitespace-pre-wrap">{suggestion.resolution_rules}</p>
            </div>
            {suggestion.suggested_resolution_date && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Suggested Resolution Date</p>
                <p className="mt-0.5">{new Date(suggestion.suggested_resolution_date).toLocaleDateString()}</p>
              </div>
            )}
          </div>
        </div>

        {/* Clarifying questions */}
        {suggestion.clarifying_questions && suggestion.clarifying_questions.length > 0 && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
            <div className="mb-3 flex items-center gap-2">
              <HelpCircle className="size-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-600">Clarifying Questions</p>
            </div>
            <ul className="space-y-1.5 text-sm">
              {suggestion.clarifying_questions.map((q, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-amber-600">•</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {suggestion.warnings && suggestion.warnings.length > 0 && (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" />
              <p className="text-sm font-semibold text-destructive">Warnings</p>
            </div>
            <ul className="space-y-1.5 text-sm">
              {suggestion.warnings.map((w, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-destructive">•</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" onClick={() => setStage('question')}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStage('edit')}>
              Edit Details
            </Button>
            <Button onClick={() => setStage('edit')}>
              <Check className="mr-2 size-4" />
              Looks Good
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // STAGE 3: Final edit + save
  return (
    <div className="space-y-5 rounded-2xl border bg-card p-6">
      <div>
        <h2 className="font-semibold">Review & Save</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Save as a draft, then submit for platform admin review.
          Once approved, your market deploys on-chain and members can trade.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Market Title *</label>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Will Ethiopia's GDP grow more than 8% in 2026?"
            maxLength={200}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional background or context for members..."
            className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
            rows={2}
            maxLength={1000}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Resolution Source</label>
          <Input
            value={resolutionSource}
            onChange={e => setResolutionSource(e.target.value)}
            placeholder="e.g. World Bank, CoinMarketCap, Premier League official site"
            maxLength={500}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Resolution Rules *</label>
          <textarea
            value={resolutionRules}
            onChange={e => setResolutionRules(e.target.value)}
            placeholder="Precise rules that determine YES vs NO. Include data source, timing, and edge cases."
            className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
            rows={5}
            maxLength={2000}
          />
          <p className="text-right text-xs text-muted-foreground">{resolutionRules.length}/2000</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Resolution Date</label>
          <Input
            type="date"
            value={resolutionDate}
            onChange={e => setResolutionDate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Button
          variant="outline"
          onClick={() => setStage(suggestion ? 'review' : 'question')}
          disabled={isSaving}
        >
          Back
        </Button>
        <div className="flex gap-2">
          <Button onClick={handleSaveDraft} disabled={isSaving}>
            {isSaving
              ? <Loader2 className="mr-2 size-4 animate-spin" />
              : <Save className="mr-2 size-4" />}
            Save as Draft
          </Button>
        </div>
      </div>
    </div>
  )
}
