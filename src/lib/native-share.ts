/**
 * Native-share helper with clipboard fallback.
 *
 * On mobile, `navigator.share` opens the OS share sheet (WhatsApp, iMessage,
 * Telegram, X, etc.) pre-populated and personalized to the user's contacts —
 * far better conversion than copying a link to the clipboard. On desktop (where
 * `navigator.share` usually isn't available) it falls back to copying the link.
 *
 * IMPORTANT: `navigator.share()` must be invoked synchronously from a user
 * gesture. Keep this helper's call path free of `await` before `navigator.share`
 * and call it directly inside the click handler — do not `await` anything else
 * first, or browsers will reject the share with a NotAllowedError.
 */

export interface NativeShareInput {
  /** The URL to share (already including any affiliate/referral params). */
  url: string
  /** Optional title — shown by some targets (e.g. as the message subject). */
  title?: string
  /** Optional descriptive text shown alongside the URL in the share sheet. */
  text?: string
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'

/** Whether the current environment can use the native share sheet for this data. */
function canNativeShare(data?: ShareData): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false
  }
  if (data && typeof navigator.canShare === 'function') {
    return navigator.canShare(data)
  }
  return true
}

/**
 * Try the native share sheet first; fall back to copying the URL.
 * Returns which path was taken so the caller can show the right feedback:
 * - 'shared'    → native sheet completed
 * - 'copied'    → fell back to clipboard (show a "Copied!" / toast)
 * - 'cancelled' → user dismissed the native sheet (show nothing)
 * - 'failed'    → neither path worked
 */
export async function shareOrCopy(input: NativeShareInput): Promise<ShareResult> {
  const shareData: ShareData = {
    url: input.url,
    ...(input.title ? { title: input.title } : {}),
    ...(input.text ? { text: input.text } : {}),
  }

  if (canNativeShare(shareData)) {
    try {
      await navigator.share(shareData)
      return 'shared'
    }
    catch (error) {
      // The user dismissing the share sheet throws AbortError — not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled'
      }
      // Any other failure falls through to the clipboard path below.
    }
  }

  try {
    await navigator.clipboard.writeText(input.url)
    return 'copied'
  }
  catch {
    return 'failed'
  }
}

export interface NativeFileShareInput {
  /** Files to share — e.g. a generated win-card PNG. */
  files: File[]
  title?: string
  text?: string
  /** Optional URL appended to the share (e.g. the user's profile/referral link). */
  url?: string
}

/**
 * Whether the environment can share these files via the native sheet.
 * Use this to decide whether to show a native "Share image" button at all —
 * it's mobile (and a few desktop browsers) only.
 */
export function canNativeShareFiles(files: File[]): boolean {
  if (
    typeof navigator === 'undefined'
    || typeof navigator.share !== 'function'
    || typeof navigator.canShare !== 'function'
  ) {
    return false
  }
  try {
    return navigator.canShare({ files })
  }
  catch {
    return false
  }
}

/**
 * Share image/files via the native sheet. Returns 'failed' if the environment
 * can't share files (caller should fall back to copy/download).
 *
 * Same gesture rule as shareOrCopy: call directly from the click handler with
 * no preceding await.
 */
export async function shareFiles(input: NativeFileShareInput): Promise<ShareResult> {
  if (!canNativeShareFiles(input.files)) {
    return 'failed'
  }

  try {
    await navigator.share({
      files: input.files,
      ...(input.title ? { title: input.title } : {}),
      ...(input.text ? { text: input.text } : {}),
      ...(input.url ? { url: input.url } : {}),
    })
    return 'shared'
  }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'cancelled'
    }
    return 'failed'
  }
}
