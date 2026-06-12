'use client'

import type { CommentTree } from '@/lib/db/queries/community-comments'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

interface ListResponse {
  items: CommentTree[]
  totalCount: number
}

async function fetchComments(marketId: string): Promise<ListResponse> {
  const res = await fetch(`/api/communities/markets/${marketId}/comments`)
  if (!res.ok) {
    throw new Error(`Failed to load comments (${res.status})`)
  }
  return res.json()
}

export function useMarketComments(marketId: string) {
  const queryClient = useQueryClient()
  const queryKey = ['community-comments', marketId]

  const query = useQuery({
    queryKey,
    queryFn: () => fetchComments(marketId),
    staleTime: 10_000,
  })

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey })
  }

  const post = useMutation({
    mutationFn: async (input: { body: string, parent_id?: string | null }) => {
      const res = await fetch(`/api/communities/markets/${marketId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to post comment')
      }
      return res.json()
    },
    onSuccess: invalidate,
  })

  const edit = useMutation({
    mutationFn: async ({ id, body }: { id: string, body: string }) => {
      const res = await fetch(`/api/communities/comments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to edit comment')
      }
      return res.json()
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/communities/comments/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to delete comment')
      }
      return res.json()
    },
    onSuccess: invalidate,
  })

  return {
    items: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: () => void query.refetch(),
    post,
    edit,
    remove,
  }
}
