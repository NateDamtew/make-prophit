'use client'

import { useExtracted } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { ShareCardPayload } from '@/lib/share-card'

import { toast } from '@/components/ui/toast'
import { useSiteIdentity } from '@/hooks/useSiteIdentity'
import { canNativeShareFiles, shareFiles } from '@/lib/native-share'
import { buildPublicProfilePath } from '@/lib/platform-routing'
import { resolveXShareAttribution } from '@/lib/x-handle'

/**
 * The share-card plumbing behind the position share dialog and the community
 * share sheet: preload the rendered PNG, copy or download it, hand it to the
 * OS share sheet, or open an X intent. The copy each surface sends is its own.
 */

export type ShareCardStatus = 'idle' | 'loading' | 'ready' | 'error'

export function useShareCardState(shareCardUrl: string) {
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

export function useShareOnXHandler(payload: ShareCardPayload | null, override?: { text: string }) {
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
      let shareText = override?.text
      if (!shareText) {
        const profileSlug = payload.userName?.trim() || 'user'
        const baseUrl = window.location.origin
        const profilePath = buildPublicProfilePath(profileSlug) ?? '/@user'
        const profileUrl = new URL(profilePath, baseUrl).toString()
        const shareAttribution = resolveXShareAttribution({
          siteName: site.name,
          twitterLink: site.twitterLink,
        })
        shareText = [
          t('I just put my money where my mouth is on {xHandle}.', { xHandle: shareAttribution ?? site.name }),
          '',
          t('Trade against me: {url}', { url: profileUrl }),
        ].join('\n')
      }

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
  }, [payload, override?.text, site.name, site.twitterLink, t])

  return { isSharingOnX, handleShareOnX }
}

export function useCopyShareImage({
  shareCardBlob,
  shareCardUrl,
  filename = 'position.png',
}: {
  shareCardBlob: Blob | null
  shareCardUrl: string
  filename?: string
}) {
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

      downloadBlob(blob, filename)
      toast.success(t('Share card downloaded.'))
    } catch (error) {
      console.error('Failed to copy share card image.', error)
      toast.error(t('Could not copy the share card image.'))
    } finally {
      setIsCopyingShareImage(false)
    }
  }, [filename, shareCardBlob, shareCardUrl, t])

  return { isCopyingShareImage, handleCopyShareImage }
}

/** Save the rendered card as a file; the browser's download prompt does the rest. */
export function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

/**
 * Native image share — drops the generated card PNG straight into the OS
 * share sheet (WhatsApp, iMessage, X, Instagram, …). This is the core viral
 * action on mobile. Falls back to nothing when files can't be shared (desktop),
 * where the "Share on X" + "Copy image" buttons remain the path.
 */
export function useNativeImageShare({
  shareCardBlob,
  payload,
  override,
}: {
  shareCardBlob: Blob | null
  payload: ShareCardPayload | null
  override?: { text: string; url: string }
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
      text: override?.text ?? t('I just put my money where my mouth is.'),
      url: override?.url ?? profileUrl,
    })
    setIsSharingImage(false)

    if (result === 'failed') {
      toast.error(t('Could not open the share sheet.'))
    }
  }, [shareCardBlob, payload, override?.text, override?.url, t])

  return { canShareImage, isSharingImage, handleNativeShareImage }
}

export function useShareCardStatusHandlers(setShareCardStatus: (status: ShareCardStatus) => void) {
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
