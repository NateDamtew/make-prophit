'use server'

import { Buffer } from 'node:buffer'
import { revalidatePath } from 'next/cache'
import sharp from 'sharp'
import { z } from 'zod'
import { DEFAULT_ERROR_MESSAGE } from '@/lib/constants'
import { CommunityRepository } from '@/lib/db/queries/community'
import { UserRepository } from '@/lib/db/queries/user'
import { getPublicAssetUrl, uploadPublicAsset } from '@/lib/storage'

const MAX_FILE_SIZE = 4 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

export interface SettingsActionState {
  error?: string
  success?: boolean
  errors?: Record<string, string | undefined>
}

function imageFileSchema(label: string) {
  return z
    .instanceof(File)
    .optional()
    .refine(file => !file || file.size === 0 || file.size <= MAX_FILE_SIZE, {
      error: `${label} must be less than 4MB`,
    })
    .refine(file => !file || file.size === 0 || ACCEPTED_IMAGE_TYPES.includes(file.type), {
      error: `${label} must be a JPG, PNG, or WebP image`,
    })
}

const UpdateCommunitySchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(50),
  description: z.string().trim().max(500).optional(),
  type: z.enum(['public', 'private']),
  jury_size: z.coerce.number().int().min(1, 'Jury needs at least 1 seat').max(10, 'Jury can have at most 10 seats'),
  rules: z.string().trim().max(2000).optional(),
  terms: z.string().trim().max(2000).optional(),
  icon: imageFileSchema('Icon'),
  banner: imageFileSchema('Banner'),
})

async function uploadResized(
  communityId: string,
  kind: 'icon' | 'banner',
  file: File,
): Promise<string | null> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const pipeline = kind === 'icon'
    ? sharp(buffer).resize(256, 256, { fit: 'cover' })
    : sharp(buffer).resize(1600, 420, { fit: 'cover' })

  const resized = await pipeline.jpeg({ quality: 88 }).toBuffer()
  const fileName = `communities/${kind}s/${communityId}-${Date.now()}.jpg`

  const { error } = await uploadPublicAsset(fileName, resized, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
  })
  if (error) {
    return null
  }
  // The community repo renders icon_url/banner_url raw (no path resolution),
  // so persist the fully-qualified public URL.
  return getPublicAssetUrl(fileName) || fileName
}

export async function updateCommunitySettingsAction(formData: FormData): Promise<SettingsActionState> {
  try {
    const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
    if (!user) {
      return { error: 'Unauthenticated.' }
    }

    const communityId = formData.get('community_id') as string
    const slug = formData.get('slug') as string
    if (!communityId || !slug) {
      return { error: DEFAULT_ERROR_MESSAGE }
    }

    // Only the community admin (or a platform admin) may edit settings.
    const { data: role } = await CommunityRepository.getMemberRole(communityId, user.id)
    if (role !== 'admin' && !user.is_admin) {
      return { error: 'Only community admins can edit settings.' }
    }

    const iconFile = formData.get('icon') as File | null
    const bannerFile = formData.get('banner') as File | null

    const parsed = UpdateCommunitySchema.safeParse({
      name: formData.get('name'),
      description: formData.get('description') ?? undefined,
      type: formData.get('type'),
      jury_size: formData.get('jury_size'),
      rules: formData.get('rules') ?? undefined,
      terms: formData.get('terms') ?? undefined,
      icon: iconFile && iconFile.size > 0 ? iconFile : undefined,
      banner: bannerFile && bannerFile.size > 0 ? bannerFile : undefined,
    })

    if (!parsed.success) {
      const errors: SettingsActionState['errors'] = {}
      parsed.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          errors[issue.path[0] as string] = issue.message
        }
      })
      return { errors }
    }

    const update: Parameters<typeof CommunityRepository.update>[1] = {
      name: parsed.data.name,
      description: parsed.data.description ?? '',
      type: parsed.data.type,
      jury_size: parsed.data.jury_size,
      rules: parsed.data.rules ?? '',
      terms: parsed.data.terms ?? '',
    }

    if (parsed.data.icon && parsed.data.icon.size > 0) {
      const path = await uploadResized(communityId, 'icon', parsed.data.icon)
      if (!path) {
        return { error: 'Could not upload the icon. Check storage configuration and try again.' }
      }
      update.icon_url = path
    }
    if (parsed.data.banner && parsed.data.banner.size > 0) {
      const path = await uploadResized(communityId, 'banner', parsed.data.banner)
      if (!path) {
        return { error: 'Could not upload the banner. Check storage configuration and try again.' }
      }
      update.banner_url = path
    }

    const { error } = await CommunityRepository.update(communityId, update)
    if (error) {
      return { error }
    }

    revalidatePath(`/community/${slug}`, 'layout')
    revalidatePath(`/community/${slug}/settings`)
    return { success: true }
  }
  catch {
    return { error: DEFAULT_ERROR_MESSAGE }
  }
}
