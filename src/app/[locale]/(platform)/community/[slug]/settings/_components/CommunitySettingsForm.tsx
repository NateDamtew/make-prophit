'use client'

import { Globe, ImageIcon, Lock, SaveIcon, Upload } from 'lucide-react'
import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { updateCommunitySettingsAction } from '../../_actions/community-settings-actions'

interface Props {
  communityId: string
  communitySlug: string
  initial: {
    name: string
    description: string | null
    type: string
    jury_size: number
    rules: string | null
    terms: string | null
    icon_url: string | null
    banner_url: string | null
  }
}

export function CommunitySettingsForm({ communityId, communitySlug, initial }: Props) {
  const [type, setType] = useState<'public' | 'private'>(initial.type === 'private' ? 'private' : 'public')
  const [jurySize, setJurySize] = useState(initial.jury_size)
  const [iconPreview, setIconPreview] = useState<string | null>(initial.icon_url)
  const [bannerPreview, setBannerPreview] = useState<string | null>(initial.banner_url)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const iconInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  function previewFile(file: File | undefined, set: (v: string | null) => void) {
    if (!file) {
      return
    }
    const url = URL.createObjectURL(file)
    set(url)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrors({})
    const formData = new FormData(e.currentTarget)
    formData.set('community_id', communityId)
    formData.set('slug', communitySlug)
    formData.set('type', type)
    formData.set('jury_size', String(jurySize))

    startTransition(async () => {
      const result = await updateCommunitySettingsAction(formData)
      if (result.errors) {
        setErrors(result.errors)
        toast.error('Please fix the highlighted fields.')
        return
      }
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Community updated.')
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="grid gap-6">
      {/* Branding */}
      <Card className="gap-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">Branding</h2>
          <p className="text-xs text-muted-foreground">Your icon and banner appear across the community page and shared links.</p>
        </div>

        {/* Banner */}
        <div className="grid gap-2">
          <Label>Banner</Label>
          <button
            type="button"
            onClick={() => bannerInputRef.current?.click()}
            className="
              group relative flex h-32 w-full items-center justify-center overflow-hidden rounded-xl border
              border-dashed bg-muted/30 transition-colors
              hover:border-primary/50
            "
          >
            {bannerPreview
              ? <img src={bannerPreview} alt="" className="size-full object-cover" />
              : (
                  <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                    <ImageIcon className="size-5" />
                    Click to upload a banner
                  </span>
                )}
            <span className="
              absolute inset-0 hidden items-center justify-center bg-background/60 text-xs font-medium backdrop-blur-sm
              group-hover:flex
            "
            >
              <Upload className="mr-1.5 size-3.5" />
              Change banner
            </span>
          </button>
          <input
            ref={bannerInputRef}
            type="file"
            name="banner"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => previewFile(e.target.files?.[0], setBannerPreview)}
          />
          {errors.banner && <p className="text-xs text-destructive">{errors.banner}</p>}
        </div>

        {/* Icon */}
        <div className="grid gap-2">
          <Label>Icon</Label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => iconInputRef.current?.click()}
              className="
                group relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border
                border-dashed bg-muted/30 transition-colors
                hover:border-primary/50
              "
            >
              {iconPreview
                ? <img src={iconPreview} alt="" className="size-full object-cover" />
                : <ImageIcon className="size-5 text-muted-foreground" />}
              <span className="
                absolute inset-0 hidden items-center justify-center bg-background/60 backdrop-blur-sm
                group-hover:flex
              "
              >
                <Upload className="size-4" />
              </span>
            </button>
            <div className="text-xs text-muted-foreground">
              <p>Square image works best.</p>
              <p>JPG, PNG, or WebP · up to 4MB.</p>
            </div>
          </div>
          <input
            ref={iconInputRef}
            type="file"
            name="icon"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => previewFile(e.target.files?.[0], setIconPreview)}
          />
          {errors.icon && <p className="text-xs text-destructive">{errors.icon}</p>}
        </div>
      </Card>

      {/* Profile */}
      <Card className="gap-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">Profile</h2>
          <p className="text-xs text-muted-foreground">Basic information shown in the hero and discovery.</p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={initial.name} maxLength={50} required />
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" defaultValue={initial.description ?? ''} maxLength={500} rows={3} />
          {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label>Visibility</Label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'public' as const, label: 'Public', desc: 'Anyone can find and join', icon: Globe },
              { value: 'private' as const, label: 'Private', desc: 'Invite-only', icon: Lock },
            ]).map((opt) => {
              const Icon = opt.icon
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={cn(
                    'flex items-start gap-2 rounded-sm border p-3 text-left transition-colors',
                    type === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                  )}
                >
                  <Icon className="mt-0.5 size-4 text-muted-foreground" />
                  <span>
                    <span className="block text-sm font-medium">{opt.label}</span>
                    <span className="block text-2xs text-muted-foreground">{opt.desc}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </Card>

      {/* Jury */}
      <Card className="gap-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">Jury</h2>
          <p className="text-xs text-muted-foreground">
            How many juror votes are needed to resolve a market.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="jury_size">Jury size</Label>
          <div className="flex items-center gap-3">
            <input
              id="jury_size"
              type="range"
              min={1}
              max={10}
              value={jurySize}
              onChange={e => setJurySize(Number(e.target.value))}
              className="h-2 flex-1 cursor-pointer accent-primary"
            />
            <span className="w-8 text-center text-base font-bold tabular-nums">{jurySize}</span>
          </div>
          {jurySize !== initial.jury_size && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
              Changing the jury size affects how future markets resolve. Markets already awaiting
              resolution keep the size they were created with.
            </p>
          )}
          {errors.jury_size && <p className="text-xs text-destructive">{errors.jury_size}</p>}
        </div>
      </Card>

      {/* Rules & terms */}
      <Card className="gap-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">Rules & terms</h2>
          <p className="text-xs text-muted-foreground">Shown on the About tab. Optional.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rules">Community rules</Label>
          <Textarea id="rules" name="rules" defaultValue={initial.rules ?? ''} maxLength={2000} rows={4} />
          {errors.rules && <p className="text-xs text-destructive">{errors.rules}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="terms">Terms</Label>
          <Textarea id="terms" name="terms" defaultValue={initial.terms ?? ''} maxLength={2000} rows={4} />
          {errors.terms && <p className="text-xs text-destructive">{errors.terms}</p>}
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          <SaveIcon className="size-4" />
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
