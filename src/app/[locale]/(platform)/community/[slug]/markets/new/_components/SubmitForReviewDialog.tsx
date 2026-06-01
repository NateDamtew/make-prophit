'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Send, Loader2, AlertCircle } from 'lucide-react'
import { submitMarketForReviewAction } from '@/app/[locale]/(platform)/community/[slug]/_actions/review-actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface CategoryOption {
  slug: string
  name: string
  isMainCategory: boolean
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  marketId: string
  marketTitle: string
  communityId: string
  communitySlug: string
}

export default function SubmitForReviewDialog({
  open,
  onOpenChange,
  marketId,
  marketTitle,
  communityId,
  communitySlug,
}: Props) {
  const router = useRouter()
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [mainCategory, setMainCategory] = useState<string>('')
  const [subCategories, setSubCategories] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) {
      return
    }
    setIsLoading(true)
    fetch('/api/categories')
      .then(r => r.ok ? r.json() : { categories: [] })
      .then((data) => {
        setCategories(data.categories ?? [])
      })
      .catch(() => setCategories([]))
      .finally(() => setIsLoading(false))
  }, [open])

  const mainCategoryOptions = categories.filter(c => c.isMainCategory)
  const subCategoryOptions = categories.filter(c => !c.isMainCategory)

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

  function handleSubmit() {
    if (!mainCategory) {
      toast.error('Please select a main category.')
      return
    }
    if (subCategories.size < 4) {
      toast.error(`Pick at least 4 sub-categories (you picked ${subCategories.size}).`)
      return
    }

    startTransition(async () => {
      const result = await submitMarketForReviewAction(
        marketId,
        communityId,
        communitySlug,
        {
          mainCategorySlug: mainCategory,
          categorySlugs: Array.from(subCategories),
        },
      )
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Submitted for review', {
        description: 'A platform admin will review your market shortly.',
      })
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit for Review</DialogTitle>
          <DialogDescription>
            Pick categories for your market. A platform admin will review it before
            it goes live on-chain (~5–15 min).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Market preview */}
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Market
            </p>
            <p className="mt-1 line-clamp-2 text-sm font-medium">{marketTitle}</p>
          </div>

          {/* Info banner */}
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <div>
              Once submitted, you can&apos;t edit until an admin reviews. They can
              accept, suggest edits, or reject with feedback.
            </div>
          </div>

          {/* Main category */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Main Category *</label>
            {isLoading
              ? (
                  <div className="h-10 animate-pulse rounded-lg bg-muted" />
                )
              : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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

          {/* Sub-categories */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Sub-categories *</label>
              <span className={cn(
                'text-xs',
                subCategories.size >= 4 ? 'text-green-600' : 'text-muted-foreground',
              )}
              >
                {subCategories.size}
                /4 minimum
              </span>
            </div>
            {isLoading
              ? (
                  <div className="h-32 animate-pulse rounded-lg bg-muted" />
                )
              : (
                  <div className="max-h-48 flex flex-wrap gap-1.5 overflow-y-auto rounded-lg border p-3">
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

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending || isLoading}>
              {isPending
                ? <Loader2 className="mr-1.5 size-4 animate-spin" />
                : <Send className="mr-1.5 size-4" />}
              Submit for Review
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
