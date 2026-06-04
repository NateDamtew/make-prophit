'use client'

import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, ShieldAlertIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface AgentApiKeyDialogProps {
  /** The newly-created or rotated raw key. Shown exactly once. */
  rawKey: string | null
  agentName: string | null
  context: 'created' | 'rotated'
  onClose: () => void
}

/**
 * One-shot key reveal dialog. The raw API key is shown here once — the user
 * copies it, then it's gone (we only persist a hash). Heavy on the warning
 * because losing the key means rotating it.
 */
export default function AgentApiKeyDialog({ rawKey, agentName, context, onClose }: AgentApiKeyDialogProps) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (rawKey) {
      setRevealed(false)
      setCopied(false)
    }
  }, [rawKey])

  const isOpen = Boolean(rawKey)

  async function handleCopy() {
    if (!rawKey) {
      return
    }
    try {
      await navigator.clipboard.writeText(rawKey)
      setCopied(true)
      window.setTimeout(setCopied, 2000, false)
      toast.success('API key copied')
    }
    catch {
      toast.error('Could not copy. Select the key and copy manually.')
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-5 text-primary" />
            {context === 'created' ? 'Agent ready' : 'New API key'}
          </DialogTitle>
          <DialogDescription>
            {agentName
              ? `Copy ${agentName}'s API key now — this is the only time you'll see it.`
              : 'Copy your new API key now — this is the only time you\'ll see it.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {/* The actual key — hidden by default, revealed on tap */}
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">API key</label>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <code className={cn(
                'flex-1 truncate font-mono text-sm tabular-nums',
                revealed ? 'select-all' : 'tracking-wider select-none',
              )}
              >
                {revealed ? rawKey ?? '' : '•'.repeat(40)}
              </code>
              <button
                type="button"
                onClick={() => setRevealed(prev => !prev)}
                aria-label={revealed ? 'Hide key' : 'Show key'}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {revealed ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Copy key"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {copied ? <CheckIcon className="size-4 text-primary" /> : <CopyIcon className="size-4" />}
              </button>
            </div>
          </div>

          {/* Important warning — leaving without copying is the most common mistake */}
          <div className="flex gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <ShieldAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <div className="grid gap-1 text-amber-900 dark:text-amber-200">
              <p className="font-medium">Save this key somewhere safe.</p>
              <p className="text-xs/relaxed">
                We only store a hash, so we can't show it again. If you lose it, rotate the key from
                your agent's settings and update your app with the new one.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" onClick={onClose}>
            I've saved it
          </Button>
          <Button type="button" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy key'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
