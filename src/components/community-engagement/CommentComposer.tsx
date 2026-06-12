'use client'

import { SendHorizonalIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CommentComposerProps {
  placeholder?: string
  onSubmit: (body: string) => Promise<unknown>
  /** Show small cancel button beside submit (used in reply boxes). */
  onCancel?: () => void
  submitLabel?: string
  autoFocus?: boolean
  compact?: boolean
}

const MAX_LENGTH = 2000

export function CommentComposer({
  placeholder = 'Add a comment…',
  onSubmit,
  onCancel,
  submitLabel = 'Post',
  autoFocus = false,
  compact = false,
}: CommentComposerProps) {
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  async function handleSubmit() {
    const trimmed = body.trim()
    if (!trimmed) {
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(trimmed)
      setBody('')
      taRef.current?.focus()
    }
    catch (error) {
      toast.error((error as Error).message)
    }
    finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Submit on Cmd/Ctrl+Enter — keeps Enter for newlines.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleSubmit()
    }
  }

  const remaining = MAX_LENGTH - body.length
  const canSubmit = !!body.trim() && !submitting

  return (
    <div className={cn('flex flex-col gap-2', compact && 'gap-1.5')}>
      <textarea
        ref={taRef}
        value={body}
        onChange={e => setBody(e.target.value.slice(0, MAX_LENGTH))}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={compact ? 2 : 3}
        autoFocus={autoFocus}
        className="
          w-full resize-none rounded-md border border-border/70 bg-background px-3 py-2 text-sm outline-none
          placeholder:text-muted-foreground
          focus:border-primary focus:ring-1 focus:ring-primary
        "
      />
      <div className="flex items-center justify-between gap-2">
        <span className={cn(
          'text-xs',
          remaining < 200 ? 'text-amber-600' : 'text-muted-foreground/70',
          remaining < 0 && 'text-(--no)',
        )}
        >
          {remaining < 200 ? `${remaining} left` : '⌘+Enter to post'}
        </span>
        <div className="flex items-center gap-1.5">
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          )}
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            <SendHorizonalIcon className="size-3.5" />
            {submitting ? 'Posting…' : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
