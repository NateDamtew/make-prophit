'use server'

import { randomUUID } from 'node:crypto'

import type { JurorProfile } from '@/lib/communities/jury-service'

import { addCorrectionNote, getJurorProfile, JuryError, rateResolution } from '@/lib/communities/jury-service'
import { UserRepository } from '@/lib/db/queries/user'
import { getPublicAssetUrl } from '@/lib/storage'
import { uploadPublicAsset } from '@/lib/storage-upload'

/**
 * Jury surfaces: a juror's public record, loser ratings, notes under a
 * revealed vote, and photo evidence uploads. The inbox is read on the server. Votes themselves go
 * through `castJuryVoteAction` so the TMA route and the web share one path.
 */

const NOT_SIGNED_IN = 'You must be signed in.'
const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024
const EVIDENCE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function describe(error: unknown, fallback: string) {
  return error instanceof JuryError ? error.message : fallback
}

export async function getJurorProfileAction(
  userId: string,
): Promise<{ data: JurorProfile | null; error: string | null }> {
  try {
    return { data: await getJurorProfile(userId), error: null }
  } catch (error) {
    console.error('[jury] profile failed', error)
    return { data: null, error: 'Could not load this juror’s record right now.' }
  }
}

export async function rateResolutionAction(input: { marketId: string; rating: number }) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { data: null, error: NOT_SIGNED_IN }
  }
  try {
    const rating = await rateResolution({ marketId: input.marketId, userId: user.id, rating: input.rating })
    return { data: { rating }, error: null }
  } catch (error) {
    return { data: null, error: describe(error, 'Could not save your rating right now.') }
  }
}

export async function addCorrectionNoteAction(input: { voteId: string; note: string }) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { data: null, error: NOT_SIGNED_IN }
  }
  try {
    await addCorrectionNote({ voteId: input.voteId, jurorId: user.id, note: input.note })
    return { data: { ok: true }, error: null }
  } catch (error) {
    return { data: null, error: describe(error, 'Could not save the note right now.') }
  }
}

/** A photo or screenshot of the source, stored under `communities/evidence/`. Returns its public URL. */
export async function uploadJuryEvidenceAction(
  formData: FormData,
): Promise<{ data: { url: string } | null; error: string | null }> {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { data: null, error: NOT_SIGNED_IN }
  }
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return { data: null, error: 'Pick a photo or screenshot first.' }
  }
  const extension = EVIDENCE_TYPES[file.type]
  if (!extension) {
    return { data: null, error: 'Use a JPG, PNG, WEBP or GIF.' }
  }
  if (file.size > MAX_EVIDENCE_BYTES) {
    return { data: null, error: 'That image is over 8 MB. Try a smaller one.' }
  }
  try {
    const body = Buffer.from(await file.arrayBuffer())
    const path = `communities/evidence/${user.id}/${randomUUID()}.${extension}`
    const { error } = await uploadPublicAsset(path, body, { contentType: file.type, cacheControl: '31536000' })
    if (error) {
      return { data: null, error: 'Could not upload the image right now.' }
    }
    return { data: { url: getPublicAssetUrl(path) || path }, error: null }
  } catch (error) {
    console.error('[jury] evidence upload failed', error)
    return { data: null, error: 'Could not upload the image right now.' }
  }
}
