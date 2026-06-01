import { NextResponse } from 'next/server'
import { TagRepository } from '@/lib/db/queries/tag'

/**
 * Public endpoint returning the platform's categories.
 * Used by community admins when submitting markets for review (they need
 * to pick a main category + 4+ sub-categories for on-chain deployment).
 */
export async function GET() {
  try {
    const { data } = await TagRepository.listTags({ limit: 100 })
    const categories = (data ?? [])
      .filter(tag => !tag.is_hidden)
      .map(tag => ({
        slug: tag.slug,
        name: tag.name,
        isMainCategory: tag.is_main_category,
      }))
    return NextResponse.json({ categories })
  }
  catch (err) {
    console.error('[/api/categories] Failed:', err)
    return NextResponse.json({ categories: [] }, { status: 200 })
  }
}
