'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronRight, ChevronLeft, Users, Lock, Globe, Check } from 'lucide-react'
import { createCommunityAction } from '@/app/[locale]/(platform)/community/[slug]/_actions/community-actions'
import { getMaxMembersForJurySize } from '@/lib/community-config'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Step = 1 | 2 | 3

const JURY_OPTIONS = [1, 2, 3, 5, 10] as const

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
}

function StepIndicator({ step, currentStep }: { step: number, currentStep: Step }) {
  const isCompleted = currentStep > step
  const isCurrent = currentStep === step

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'flex size-8 items-center justify-center rounded-full text-sm font-semibold transition-all',
          isCompleted && 'bg-primary text-primary-foreground',
          isCurrent && 'border-2 border-primary bg-background text-primary',
          !isCompleted && !isCurrent && 'border border-border bg-background text-muted-foreground',
        )}
      >
        {isCompleted ? <Check className="size-4" /> : step}
      </div>
      <span className={cn('hidden text-sm sm:block', isCurrent ? 'font-medium' : 'text-muted-foreground')}>
        {step === 1 ? 'Basics' : step === 2 ? 'Governance' : 'Review'}
      </span>
    </div>
  )
}

export default function CreateCommunityForm() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [isLoading, setIsLoading] = useState(false)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'public' | 'private'>('public')
  const [jurySize, setJurySize] = useState(1)
  const [rules, setRules] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const maxMembers = getMaxMembersForJurySize(jurySize)

  function handleNameChange(value: string) {
    setName(value)
    if (!slugEdited) {
      setSlug(slugify(value))
    }
  }

  function handleSlugChange(value: string) {
    setSlugEdited(true)
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
  }

  function validateStep1() {
    if (name.trim().length < 3) {
      return 'Name must be at least 3 characters.'
    }
    if (slug.length < 3) {
      return 'Slug must be at least 3 characters.'
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return 'Slug can only contain lowercase letters, numbers, and hyphens.'
    }
    return null
  }

  function handleNext() {
    if (step === 1) {
      const err = validateStep1()
      if (err) {
        setError(err)
        return
      }
    }
    setError(null)
    setStep(s => (s < 3 ? s + 1 : s) as Step)
  }

  async function handleSubmit() {
    setIsLoading(true)
    setError(null)
    try {
      const result = await createCommunityAction({
        name: name.trim(),
        slug,
        description: description.trim() || undefined,
        type,
        jury_size: jurySize,
        rules: rules.trim() || undefined,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      toast.success('Community created!', {
        description: `${name} is now live.`,
      })
      router.push(`/community/${slug}`)
    }
    finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border bg-card">
      {/* Step indicator */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <StepIndicator step={1} currentStep={step} />
        <div className="h-px flex-1 bg-border" />
        <StepIndicator step={2} currentStep={step} />
        <div className="h-px flex-1 bg-border" />
        <StepIndicator step={3} currentStep={step} />
      </div>

      <div className="p-6">
        {/* Step 1: Basics */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Basic Information</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Give your community a name and identity.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Community Name *</label>
              <Input
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="Ethiopian Traders"
                maxLength={50}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Slug *</label>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">prophit.com/community/</span>
                <input
                  value={slug}
                  onChange={e => handleSlugChange(e.target.value)}
                  className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                  placeholder="ethiopian-traders"
                  maxLength={50}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Prediction markets for Ethiopian politics, finance, and sports..."
                className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
                rows={3}
                maxLength={500}
              />
              <p className="text-right text-xs text-muted-foreground">{description.length}/500</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Community Type *</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setType('public')}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border p-4 transition-all',
                    type === 'public'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'hover:border-border/80 hover:bg-muted/30',
                  )}
                >
                  <Globe className="size-5" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Public</p>
                    <p className="text-xs text-muted-foreground">Anyone can join</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setType('private')}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border p-4 transition-all',
                    type === 'private'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'hover:border-border/80 hover:bg-muted/30',
                  )}
                >
                  <Lock className="size-5" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Private</p>
                    <p className="text-xs text-muted-foreground">Invite-only</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Governance */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Governance Setup</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Configure your jury size and community rules.
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Jury Size *</label>
              <p className="text-xs text-muted-foreground">
                Larger juries allow more members and require higher consensus to resolve markets.
              </p>
              <div className="grid grid-cols-5 gap-2">
                {JURY_OPTIONS.map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setJurySize(size)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border p-3 transition-all',
                      jurySize === size
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'hover:border-border/80 hover:bg-muted/30',
                    )}
                  >
                    <span className="text-lg font-bold">{size}</span>
                    <span className="text-xs text-muted-foreground">
                      {size === 1 ? 'juror' : 'jurors'}
                    </span>
                  </button>
                ))}
              </div>

              <div className="rounded-xl bg-muted/50 p-4 text-sm">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-primary" />
                  <span className="font-medium">
                    Up to
                    {' '}
                    {maxMembers}
                    {' '}
                    members
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {jurySize <= 2
                    ? 'Requires unanimous consent to resolve markets.'
                    : `Requires ${Math.ceil(jurySize * 0.75)} of ${jurySize} jurors (>75%) to resolve markets.`}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Community Rules</label>
              <textarea
                value={rules}
                onChange={e => setRules(e.target.value)}
                placeholder="e.g. All markets must resolve within 90 days. No political markets that could cause division. Markets must have a clear and verifiable resolution source."
                className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
                rows={4}
                maxLength={2000}
              />
              <p className="text-right text-xs text-muted-foreground">{rules.length}/2000</p>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Review & Create</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Confirm your community settings before publishing.
              </p>
            </div>

            <div className="space-y-3 rounded-xl border bg-muted/20 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{name}</p>
                  <p className="text-sm text-muted-foreground">prophit.com/community/{slug}</p>
                </div>
                <span className="rounded-full border px-2.5 py-0.5 text-xs capitalize">
                  {type}
                </span>
              </div>

              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}

              <div className="flex gap-6 border-t pt-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Jury Size</p>
                  <p className="font-medium">{jurySize} {jurySize === 1 ? 'juror' : 'jurors'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Max Members</p>
                  <p className="font-medium">{maxMembers}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Consensus</p>
                  <p className="font-medium">
                    {jurySize <= 2 ? 'Unanimous' : `>${Math.ceil(jurySize * 0.75) * 100 / jurySize}%`}
                  </p>
                </div>
              </div>

              {rules && (
                <div className="border-t pt-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Rules</p>
                  <p className="text-sm">{rules}</p>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              You will be the community admin and first juror. You can invite other members and
              appoint additional jurors after creation.
            </p>
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-destructive">{error}</p>
        )}

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between">
          {step > 1
            ? (
                <Button
                  variant="outline"
                  onClick={() => setStep(s => (s > 1 ? s - 1 : s) as Step)}
                  disabled={isLoading}
                >
                  <ChevronLeft className="mr-1.5 size-4" />
                  Back
                </Button>
              )
            : <div />}

          {step < 3
            ? (
                <Button onClick={handleNext}>
                  Next
                  <ChevronRight className="ml-1.5 size-4" />
                </Button>
              )
            : (
                <Button onClick={handleSubmit} disabled={isLoading}>
                  {isLoading ? 'Creating...' : 'Create Community'}
                </Button>
              )}
        </div>
      </div>
    </div>
  )
}
