'use client'

import { CopyIcon, Loader2Icon, ShareIcon, XIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ShareCardFormat, ShareCardPayload } from '@/lib/share-card'

import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useSiteIdentity } from '@/hooks/useSiteIdentity'
import { canNativeShareFiles, shareFiles } from '@/lib/native-share'
import { buildPublicProfilePath } from '@/lib/platform-routing'
import { buildShareCardUrl } from '@/lib/share-card'
import { cn } from '@/lib/utils'
import { resolveXShareAttribution } from '@/lib/x-handle'

interface PositionShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payload: ShareCardPayload | null
}

function useShareCardUrl(payload: ShareCardPayload | null, format: ShareCardFormat) {
  return useMemo(() => {
    if (!payload) {
      return ''
    }
    return buildShareCardUrl(payload, format)
  }, [format, payload])
}

export function PositionShareDialog({ open, onOpenChange, payload }: PositionShareDialogProps) {
  const t = useExtracted()
  const isMobile = useIsMobile()
  const [format, setFormat] = useState<ShareCardFormat>('square')
  const shareCardUrl = useShareCardUrl(payload, format)

  const dialogContent = open ? (
    <PositionShareDialogContent
      key={shareCardUrl || 'empty'}
      payload={payload}
      shareCardUrl={shareCardUrl}
      format={format}
      onFormatChange={setFormat}
    />
  ) : null

  const closeButtonClassName =
    'flex size-11 items-center justify-center rounded-full text-[#A3A3A3] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'

  return isMobile ? (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh] w-full rounded-t-[20px] border-0 bg-[#111113] text-[#F2F2F2] data-[swipe-direction=down]:rounded-t-[20px] data-[swipe-direction=down]:border-t-0">
        <div className="flex flex-col gap-4 p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-lg leading-none font-semibold text-[#F2F2F2]">
              {t('Shill your bag')}
            </DrawerTitle>
            <button type="button" className={cn(closeButtonClassName, '-mr-3')} onClick={() => onOpenChange(false)}>
              <XIcon className="size-5" />
              <span className="sr-only">{t('Close')}</span>
            </button>
          </div>
          {dialogContent}
        </div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md gap-4 rounded-[20px] border-0 bg-[#111113] p-6 text-[#F2F2F2] shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <DialogTitle className="text-lg leading-none font-semibold text-[#F2F2F2]">{t('Shill your bag')}</DialogTitle>
          <DialogClose className={cn(closeButtonClassName, '-mr-3')}>
            <XIcon className="size-5" />
            <span className="sr-only">{t('Close')}</span>
          </DialogClose>
        </div>
        {dialogContent}
      </DialogContent>
    </Dialog>
  )
}

interface PositionShareDialogContentProps {
  payload: ShareCardPayload | null
  shareCardUrl: string
  format: ShareCardFormat
  onFormatChange: (format: ShareCardFormat) => void
}

type ShareCardStatus = 'idle' | 'loading' | 'ready' | 'error'

function useShareCardState(shareCardUrl: string) {
  const [shareCardStatus, setShareCardStatus] = useState<ShareCardStatus>(shareCardUrl ? 'loading' : 'idle')
  const [shareCardBlob, setShareCardBlob] = useState<Blob | null>(null)

  useEffect(
    function preloadShareCardBlob() {
      if (!shareCardUrl || shareCardStatus !== 'ready') {
        return
      }

      let isCancelled = false
      const abortController = new AbortController()

      fetch(shareCardUrl, { signal: abortController.signal })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error('Share card fetch failed.')
          }
          return await response.blob()
        })
        .then((blob) => {
          if (!isCancelled) {
            setShareCardBlob(blob)
          }
        })
        .catch((error) => {
          if (!isCancelled) {
            console.warn('Failed to preload share card image.', error)
            setShareCardBlob(null)
          }
        })

      return function cancelShareCardBlobPreload() {
        isCancelled = true
        abortController.abort()
      }
    },
    [shareCardStatus, shareCardUrl],
  )

  return { shareCardStatus, setShareCardStatus, shareCardBlob }
}

function useShareOnXHandler(payload: ShareCardPayload | null) {
  const t = useExtracted()
  const site = useSiteIdentity()
  const [isSharingOnX, setIsSharingOnX] = useState(false)
  const shareOnXTimeoutRef = useRef<number | null>(null)

  useEffect(function clearShareOnXTimeoutOnUnmount() {
    const timeoutRefSnapshot = shareOnXTimeoutRef
    return function cleanupShareOnXTimeout() {
      if (timeoutRefSnapshot.current !== null) {
        window.clearTimeout(timeoutRefSnapshot.current)
      }
    }
  }, [])

  const handleShareOnX = useCallback(() => {
    if (!payload) {
      return
    }

    setIsSharingOnX(true)
    try {
      const profileSlug = payload.userName?.trim() || 'user'
      const baseUrl = window.location.origin
      const profilePath = buildPublicProfilePath(profileSlug) ?? '/@user'
      const profileUrl = new URL(profilePath, baseUrl).toString()
      const shareAttribution = resolveXShareAttribution({
        siteName: site.name,
        twitterLink: site.twitterLink,
      })
      const shareText = [
        t('I just put my money where my mouth is on {xHandle}.', { xHandle: shareAttribution ?? site.name }),
        '',
        t('Trade against me: {url}', { url: profileUrl }),
      ].join('\n')

      const shareUrl = new URL('https://x.com/intent/tweet')
      shareUrl.searchParams.set('text', shareText)
      window.open(shareUrl.toString(), '_blank', 'noopener,noreferrer')
    } finally {
      if (shareOnXTimeoutRef.current !== null) {
        window.clearTimeout(shareOnXTimeoutRef.current)
      }

      shareOnXTimeoutRef.current = window.setTimeout(() => {
        setIsSharingOnX(false)
        shareOnXTimeoutRef.current = null
      }, 200)
    }
  }, [payload, site.name, site.twitterLink, t])

  return { isSharingOnX, handleShareOnX }
}

function useCopyShareImage({ shareCardBlob, shareCardUrl }: { shareCardBlob: Blob | null; shareCardUrl: string }) {
  const t = useExtracted()
  const [isCopyingShareImage, setIsCopyingShareImage] = useState(false)

  const handleCopyShareImage = useCallback(async () => {
    if (!shareCardUrl) {
      return
    }

    setIsCopyingShareImage(true)
    try {
      if (!shareCardBlob) {
        toast.info(t('Share card is still preparing. Try again in a moment.'))
        return
      }

      const blob = shareCardBlob.type ? shareCardBlob : new Blob([shareCardBlob], { type: 'image/png' })
      const filename = 'position.png'

      if (typeof window !== 'undefined' && window.isSecureContext && 'ClipboardItem' in window) {
        try {
          const clipboardItem = new ClipboardItem({ [blob.type || 'image/png']: blob })
          await navigator.clipboard.write([clipboardItem])
          toast.success(t('Share card copied to clipboard.'))
          return
        } catch (error) {
          console.warn('Clipboard write failed, falling back to download.', error)
        }
      }

      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
      toast.success(t('Share card downloaded.'))
    } catch (error) {
      console.error('Failed to copy share card image.', error)
      toast.error(t('Could not copy the share card image.'))
    } finally {
      setIsCopyingShareImage(false)
    }
  }, [shareCardBlob, shareCardUrl, t])

  return { isCopyingShareImage, handleCopyShareImage }
}

/**
 * Native image share — drops the generated win-card PNG straight into the OS
 * share sheet (WhatsApp, iMessage, X, Instagram, …). This is the core viral
 * action on mobile. Falls back to nothing when files can't be shared (desktop),
 * where the "Share on X" + "Copy image" buttons remain the path.
 */
function useNativeImageShare({
  shareCardBlob,
  payload,
}: {
  shareCardBlob: Blob | null
  payload: ShareCardPayload | null
}) {
  const t = useExtracted()
  const [canShareImage, setCanShareImage] = useState(false)
  const [isSharingImage, setIsSharingImage] = useState(false)

  // navigator is undefined during SSR — probe capability on the client only.
  useEffect(() => {
    const probe = new File([new Blob([''], { type: 'image/png' })], 'probe.png', { type: 'image/png' })
    // oxlint-disable-next-line react/set-state-in-effect
    setCanShareImage(canNativeShareFiles([probe]))
  }, [])

  const handleNativeShareImage = useCallback(async () => {
    if (!shareCardBlob) {
      toast.info(t('Share card is still preparing. Try again in a moment.'))
      return
    }

    const file = new File([shareCardBlob], 'position.png', {
      type: shareCardBlob.type || 'image/png',
    })

    const profileSlug = payload?.userName?.trim() || 'user'
    const profilePath = buildPublicProfilePath(profileSlug) ?? '/@user'
    const profileUrl =
      typeof window !== 'undefined' ? new URL(profilePath, window.location.origin).toString() : undefined

    setIsSharingImage(true)
    const result = await shareFiles({
      files: [file],
      title: payload?.title ?? undefined,
      text: t('I just put my money where my mouth is.'),
      url: profileUrl,
    })
    setIsSharingImage(false)

    if (result === 'failed') {
      toast.error(t('Could not open the share sheet.'))
    }
  }, [shareCardBlob, payload, t])

  return { canShareImage, isSharingImage, handleNativeShareImage }
}

function useShareCardStatusHandlers(setShareCardStatus: (status: ShareCardStatus) => void) {
  const t = useExtracted()
  const handleShareCardLoaded = useCallback(() => {
    setShareCardStatus('ready')
  }, [setShareCardStatus])

  const handleShareCardError = useCallback(() => {
    setShareCardStatus('error')
    toast.error(t('Unable to generate a share card right now.'))
  }, [setShareCardStatus, t])

  return { handleShareCardLoaded, handleShareCardError }
}

function PositionShareDialogContent({
  payload,
  shareCardUrl,
  format,
  onFormatChange,
}: PositionShareDialogContentProps) {
  const t = useExtracted()
  const { shareCardStatus, setShareCardStatus, shareCardBlob } = useShareCardState(shareCardUrl)
  const { isCopyingShareImage, handleCopyShareImage } = useCopyShareImage({ shareCardBlob, shareCardUrl })
  const { isSharingOnX, handleShareOnX } = useShareOnXHandler(payload)
  const { canShareImage, isSharingImage, handleNativeShareImage } = useNativeImageShare({ shareCardBlob, payload })
  const { handleShareCardLoaded, handleShareCardError } = useShareCardStatusHandlers(setShareCardStatus)

  const isShareReady = shareCardStatus === 'ready'
  const isBusy = isCopyingShareImage || isSharingOnX || isSharingImage

  const isTall = format !== 'landscape'
  const imageWidth = isTall ? 1080 : 1200
  const imageHeight = format === 'portrait' ? 1350 : isTall ? 1080 : 630
  const primaryButtonClassName =
    'flex h-[52px] flex-[1.4] items-center justify-center gap-2.5 rounded-[14px] bg-[#EDFF3D] text-[15px] font-bold text-[#111113] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-2px_0_rgba(0,0,0,0.12)] transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50'
  const formatOptions: Array<{ value: ShareCardFormat; label: string }> = [
    { value: 'square', label: t('Square') },
    { value: 'portrait', label: t('Story') },
    { value: 'landscape', label: t('Wide') },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-full rounded-[10px] bg-[#1E1E21] p-1" role="tablist" aria-label={t('Share card size')}>
        {formatOptions.map((option) => {
          const isActive = format === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onFormatChange(option.value)}
              className={cn(
                'h-[34px] flex-1 rounded-[7px] text-sm transition-colors',
                isActive ? 'bg-white font-semibold text-[#111113]' : 'bg-transparent text-[#A3A3A3] hover:text-white',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <div className="relative flex min-h-55 items-center justify-center">
        {shareCardUrl && (
          <Image
            key={shareCardUrl}
            src={shareCardUrl}
            alt={t('{title} share card', { title: payload?.title ?? t('Position') })}
            width={imageWidth}
            height={imageHeight}
            loading="eager"
            unoptimized
            className={cn(
              'h-auto w-full rounded-[14px] transition-opacity',
              format === 'portrait' && 'max-h-[58vh] w-auto max-w-full',
              isShareReady ? 'opacity-100' : 'opacity-0',
            )}
            onLoad={handleShareCardLoaded}
            onError={handleShareCardError}
          />
        )}
        {!isShareReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[14px] bg-[#1E1E21] text-sm text-[#A3A3A3]">
            {shareCardStatus === 'error' ? (
              <span>{t('Unable to generate share card.')}</span>
            ) : (
              <>
                <Spinner className="size-5" />
                <span>{t('Generating share card...')}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={handleCopyShareImage}
          disabled={!isShareReady || isBusy}
          className="flex h-[52px] flex-1 items-center justify-center gap-2.5 rounded-[14px] bg-[#1E1E21] text-[15px] font-semibold text-[#F2F2F2] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] transition-colors hover:bg-[#26262a] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCopyingShareImage ? <Spinner className="size-[18px]" /> : <CopyIcon className="size-[18px]" />}
          {isCopyingShareImage ? t('Copying...') : t('Copy image')}
        </button>

        {canShareImage ? (
          // Mobile: native share sheet with the slip attached.
          <button
            type="button"
            onClick={handleNativeShareImage}
            disabled={!isShareReady || isBusy}
            className={primaryButtonClassName}
          >
            {isSharingImage ? (
              <Loader2Icon className="size-[18px] animate-spin" strokeWidth={2.4} />
            ) : (
              <ShareIcon className="size-[18px]" strokeWidth={2.4} />
            )}
            {isSharingImage ? t('Opening...') : t('Share')}
          </button>
        ) : (
          // Desktop fallback: X intent.
          <button
            type="button"
            onClick={handleShareOnX}
            disabled={!isShareReady || isBusy}
            className={primaryButtonClassName}
          >
            {isSharingOnX ? (
              <Loader2Icon className="size-[18px] animate-spin" strokeWidth={2.4} />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 251 256" className="size-[18px]" aria-hidden="true">
                <path
                  d="M149.079 108.399L242.33 0h-22.098l-80.97 94.12L74.59 0H0l97.796 142.328L0 256h22.1l85.507-99.395L175.905 256h74.59L149.073 108.399zM118.81 143.58l-9.909-14.172l-78.84-112.773h33.943l63.625 91.011l9.909 14.173l82.705 118.3H186.3l-67.49-96.533z"
                  fill="currentColor"
                />
              </svg>
            )}
            {isSharingOnX ? t('Opening...') : t('Share on X')}
          </button>
        )}
      </div>
    </div>
  )
}
