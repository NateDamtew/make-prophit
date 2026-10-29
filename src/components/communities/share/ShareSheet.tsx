'use client'

import { CheckIcon, DownloadIcon, LinkIcon, Loader2Icon, ShareIcon, XIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import Image from 'next/image'
import { useMemo, useState } from 'react'

import type { ShareCardFormat, ShareCardPayload } from '@/lib/share-card'

import {
  downloadBlob,
  useCopyShareImage,
  useNativeImageShare,
  useShareCardState,
  useShareCardStatusHandlers,
  useShareOnXHandler,
} from '@/app/[locale]/(platform)/_components/share-card-hooks'
import { CommunitySheet } from '@/components/communities/sheet/CommunitySheet'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { buildShareCardUrl } from '@/lib/share-card'
import { cn } from '@/lib/utils'

/**
 * "Share your call" after a stake and "Share your win" after a payout: the
 * slip in three sizes, then WhatsApp first (that is where the link lands),
 * X, copy link, and the image itself. The link opens this market and carries
 * the sharer's username so friends who join through it are attributed.
 */

export type ShareKind = 'call' | 'won'

interface ShareSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payload: ShareCardPayload | null
  kind: ShareKind
  /** Path of the market on this site, e.g. `/community/daily-ledger/market/abc`. */
  marketPath: string
  communityName: string
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2m0 1.67c4.54 0 8.24 3.7 8.24 8.24s-3.7 8.24-8.24 8.24c-1.48 0-2.93-.4-4.19-1.15l-.3-.17-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.39c0-4.54 3.7-8.24 8.24-8.24m-3.5 4.4c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.6c.12.17 1.77 2.7 4.29 3.79 2.1.83 2.52.66 2.98.62.46-.04 1.48-.6 1.69-1.19.21-.58.21-1.08.15-1.19-.06-.1-.23-.17-.48-.29-.25-.12-1.48-.73-1.71-.81-.23-.08-.4-.12-.56.13-.17.25-.65.81-.79.98-.15.17-.29.19-.54.06-.25-.12-1.06-.39-2.01-1.24-.74-.66-1.24-1.48-1.39-1.73-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.44.12-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.42h-.49" />
    </svg>
  )
}

function XLogo({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 251 256" className={className} aria-hidden="true">
      <path
        d="M149.079 108.399L242.33 0h-22.098l-80.97 94.12L74.59 0H0l97.796 142.328L0 256h22.1l85.507-99.395L175.905 256h74.59L149.073 108.399zM118.81 143.58l-9.909-14.172l-78.84-112.773h33.943l63.625 91.011l9.909 14.173l82.705 118.3H186.3l-67.49-96.533z"
        fill="currentColor"
      />
    </svg>
  )
}

export function ShareSheet({ open, onOpenChange, payload, kind, marketPath, communityName }: ShareSheetProps) {
  const t = useExtracted()
  const title = kind === 'won' ? t('Share your win') : t('Share your call')
  return (
    <CommunitySheet open={open} onOpenChange={onOpenChange} title={title}>
      {open ? (
        <ShareSheetContent
          payload={payload}
          kind={kind}
          marketPath={marketPath}
          communityName={communityName}
          title={title}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </CommunitySheet>
  )
}

function ShareSheetContent({
  payload,
  kind,
  marketPath,
  communityName,
  title,
  onClose,
}: {
  payload: ShareCardPayload | null
  kind: ShareKind
  marketPath: string
  communityName: string
  title: string
  onClose: () => void
}) {
  const t = useExtracted()
  const [format, setFormat] = useState<ShareCardFormat>('square')
  const [copied, setCopied] = useState(false)
  const shareCardUrl = useMemo(() => (payload ? buildShareCardUrl(payload, format) : ''), [payload, format])

  // The link opens this market; `ref` is the sharer, so sign-ups through it are theirs.
  const shareLink = useMemo(() => {
    if (typeof window === 'undefined') {
      return marketPath
    }
    const url = new URL(marketPath, window.location.origin)
    if (payload?.userName) {
      url.searchParams.set('ref', payload.userName.replace(/^@/, ''))
    }
    return url.toString()
  }, [marketPath, payload])

  const outcome = payload?.outcome ?? ''
  const message =
    kind === 'won'
      ? t('I called {outcome} on “{title}” in {community} and won {amount}. Your call next:', {
          outcome,
          title: payload?.title ?? '',
          community: communityName,
          amount: payload?.won ?? payload?.toWin ?? '',
        })
      : t('My call in {community}: {outcome} on “{title}” at {odds}. Make yours:', {
          community: communityName,
          outcome,
          title: payload?.title ?? '',
          odds: payload?.odds ?? '',
        })
  const messageWithLink = `${message} ${shareLink}`

  const { shareCardStatus, setShareCardStatus, shareCardBlob } = useShareCardState(shareCardUrl)
  const { handleShareCardLoaded, handleShareCardError } = useShareCardStatusHandlers(setShareCardStatus)
  const { isCopyingShareImage, handleCopyShareImage } = useCopyShareImage({
    shareCardBlob,
    shareCardUrl,
    filename: kind === 'won' ? 'my-win.png' : 'my-call.png',
  })
  const { isSharingOnX, handleShareOnX } = useShareOnXHandler(payload, { text: messageWithLink })
  const { canShareImage, isSharingImage, handleNativeShareImage } = useNativeImageShare({
    shareCardBlob,
    payload,
    override: { text: message, url: shareLink },
  })

  const isReady = shareCardStatus === 'ready'
  const isTall = format !== 'landscape'
  const imageWidth = isTall ? 1080 : 1200
  const imageHeight = format === 'portrait' ? 1350 : isTall ? 1080 : 630

  function openWhatsApp() {
    const url = new URL('https://wa.me/')
    url.searchParams.set('text', messageWithLink)
    window.open(url.toString(), '_blank', 'noopener,noreferrer')
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('Could not copy the link.'))
    }
  }

  function download() {
    if (!shareCardBlob) {
      toast.info(t('Share card is still preparing. Try again in a moment.'))
      return
    }
    downloadBlob(shareCardBlob, kind === 'won' ? 'my-win.png' : 'my-call.png')
  }

  const formats: Array<{ value: ShareCardFormat; label: string }> = [
    { value: 'square', label: t('Square') },
    { value: 'portrait', label: t('Story') },
    { value: 'landscape', label: t('Wide') },
  ]

  const secondaryButton =
    'flex h-14 flex-col items-center justify-center gap-1 rounded-[10px] bg-secondary text-[12px] font-semibold transition-colors hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
        <button
          type="button"
          aria-label={t('Close')}
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary"
        >
          <XIcon className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex rounded-[10px] bg-secondary p-1" role="tablist" aria-label={t('Share card size')}>
        {formats.map((option) => {
          const active = format === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFormat(option.value)}
              className={cn(
                'h-9 flex-1 rounded-[7px] text-sm transition-colors',
                active ? 'bg-foreground font-semibold text-background' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <div className="relative flex min-h-48 items-center justify-center">
        {shareCardUrl && (
          <Image
            key={shareCardUrl}
            src={shareCardUrl}
            alt={t('{title} share card', { title: payload?.title ?? title })}
            width={imageWidth}
            height={imageHeight}
            loading="eager"
            unoptimized
            className={cn(
              'h-auto w-full rounded-[14px] transition-opacity',
              format === 'portrait' && 'max-h-[50vh] w-auto max-w-full',
              isReady ? 'opacity-100' : 'opacity-0',
            )}
            onLoad={handleShareCardLoaded}
            onError={handleShareCardError}
          />
        )}
        {!isReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[14px] bg-secondary text-sm text-muted-foreground">
            {shareCardStatus === 'error' ? (
              <span>{t('Unable to generate share card.')}</span>
            ) : (
              <>
                <Spinner className="size-5" />
                <span>{t('Preparing your card…')}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button type="button" className={secondaryButton} onClick={openWhatsApp}>
          <WhatsAppIcon className="size-5" />
          WhatsApp
        </button>
        <button type="button" className={secondaryButton} onClick={handleShareOnX} disabled={isSharingOnX}>
          <XLogo className="size-4" />X
        </button>
        <button type="button" className={secondaryButton} onClick={() => void copyLink()}>
          {copied ? (
            <CheckIcon className="size-5" aria-hidden="true" />
          ) : (
            <LinkIcon className="size-5" aria-hidden="true" />
          )}
          {copied ? t('Copied') : t('Copy link')}
        </button>
        {canShareImage ? (
          <button
            type="button"
            className={secondaryButton}
            onClick={() => void handleNativeShareImage()}
            disabled={!isReady || isSharingImage}
          >
            {isSharingImage ? (
              <Loader2Icon className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <ShareIcon className="size-5" aria-hidden="true" />
            )}
            {t('More')}
          </button>
        ) : (
          <button
            type="button"
            className={secondaryButton}
            onClick={() => void handleCopyShareImage()}
            disabled={!isReady || isCopyingShareImage}
          >
            {isCopyingShareImage ? (
              <Loader2Icon className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <DownloadIcon className="size-5" aria-hidden="true" />
            )}
            {t('Image')}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={canShareImage && isReady ? () => void handleNativeShareImage() : openWhatsApp}
        className="flex h-13 w-full items-center justify-center gap-2 rounded-md bg-primary text-base font-bold text-primary-foreground shadow-lg ring-1 shadow-primary/20 ring-primary/20"
      >
        <WhatsAppIcon className="size-5" />
        {t('Share to WhatsApp')}
      </button>
      {!canShareImage && (
        <button
          type="button"
          onClick={download}
          disabled={!isReady}
          className="self-center text-sm font-semibold underline underline-offset-[3px] disabled:opacity-50"
        >
          {t('Download the image')}
        </button>
      )}

      <p className="text-center text-xs/relaxed text-muted-foreground">
        {kind === 'won'
          ? t('Cards show this one win only. Your balance and total winnings never appear.')
          : t('Your link opens this market. Friends who join through it show up on your profile.')}
      </p>
    </div>
  )
}
