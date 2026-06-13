'use client'

import { CheckIcon, Code2Icon, CopyIcon, ExternalLinkIcon, MonitorIcon, SmartphoneIcon, TabletIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface EmbedCodeButtonProps {
  communitySlug: string
  marketId: string
  /** Origin used to build the iframe src. Server-injected; e.g. https://makeprophit.com. */
  siteOrigin: string
  /** Render the iframe at a custom default height (px). */
  defaultHeight?: number
}

type PreviewWidth = 'mobile' | 'tablet' | 'desktop'

const PREVIEW_SIZES: Record<PreviewWidth, { label: string, width: number, icon: typeof SmartphoneIcon }> = {
  mobile: { label: 'Mobile', width: 320, icon: SmartphoneIcon },
  tablet: { label: 'Tablet', width: 640, icon: TabletIcon },
  desktop: { label: 'Desktop', width: 800, icon: MonitorIcon },
}

export function EmbedCodeButton({ communitySlug, marketId, siteOrigin, defaultHeight = 360 }: EmbedCodeButtonProps) {
  const [open, setOpen] = useState(false)
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>('desktop')
  const [copied, setCopied] = useState(false)
  const [height, setHeight] = useState(defaultHeight)

  const embedUrl = `${siteOrigin.replace(/\/$/, '')}/embed/community/${communitySlug}/market/${marketId}`
  const snippet = useMemo(
    () => `<iframe src="${embedUrl}" width="100%" height="${height}" frameborder="0" loading="lazy" allow="" referrerpolicy="no-referrer-when-downgrade" title="Prophit market"></iframe>`,
    [embedUrl, height],
  )

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      toast.success('Embed code copied')
      setTimeout(setCopied, 2000, false)
    }
    catch {
      toast.error('Could not copy — select the snippet manually.')
    }
  }

  const previewPx = PREVIEW_SIZES[previewWidth].width

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Code2Icon className="size-3.5" />
        Embed
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border/60 px-5 py-4">
            <DialogTitle>Embed this market</DialogTitle>
            <DialogDescription>
              Paste the snippet into any article, newsletter, or page. Updates as the market does.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 p-5">
            {/* Preview width switcher */}
            <div className="flex items-center gap-1.5">
              {(['mobile', 'tablet', 'desktop'] as const).map((key) => {
                const opt = PREVIEW_SIZES[key]
                const Icon = opt.icon
                const isActive = key === previewWidth
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPreviewWidth(key)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs font-medium transition-colors',
                      isActive
                        ? 'border-primary bg-primary/10 text-primary'
                        : `
                          border-border bg-background text-muted-foreground
                          hover:border-primary/40 hover:text-foreground
                        `,
                    )}
                  >
                    <Icon className="size-3.5" />
                    {opt.label}
                    <span className="text-2xs opacity-70">
                      {opt.width}
                      px
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Live preview */}
            <div className="overflow-hidden rounded-sm border bg-muted/30 p-3">
              <div className="mx-auto overflow-hidden rounded-sm bg-background" style={{ width: previewPx, maxWidth: '100%' }}>
                <iframe
                  src={embedUrl}
                  title="Embed preview"
                  width="100%"
                  height={height}
                  className="block border-0"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Controls */}
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="grid gap-1.5 text-xs font-medium">
                Iframe height (px)
                <input
                  type="number"
                  min={240}
                  max={1200}
                  value={height}
                  onChange={e => setHeight(Math.max(240, Math.min(1200, Number(e.target.value) || defaultHeight)))}
                  className="
                    rounded-md border border-border/70 bg-background px-3 py-2 text-sm outline-none
                    focus:border-primary focus:ring-1 focus:ring-primary
                  "
                />
              </label>
              <Button asChild variant="ghost" size="sm">
                <a href={embedUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon className="size-3.5" />
                  Open raw embed
                </a>
              </Button>
            </div>

            {/* Snippet */}
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium">Embed snippet</label>
                <Button size="sm" variant={copied ? 'default' : 'outline'} onClick={copySnippet}>
                  {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <textarea
                readOnly
                value={snippet}
                rows={4}
                className="
                  w-full resize-none rounded-md border border-border/70 bg-muted/30 px-3 py-2 font-mono text-2xs
                  leading-snug outline-none
                "
                onFocus={e => e.currentTarget.select()}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
