'use client'

import Image from 'next/image'
import { useTmaUser } from './TmaProvider'

export default function TmaHeader({ title }: { title?: string }) {
  const user = useTmaUser()

  return (
    <header className="
      sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4
      backdrop-blur-sm
    "
    >
      <span className="text-base font-semibold">{title ?? 'Prophit'}</span>
      {user && (
        <div className="flex items-center gap-2">
          {user.photo_url && (
            <Image
              src={user.photo_url}
              alt={user.first_name}
              width={32}
              height={32}
              className="rounded-full"
            />
          )}
          <span className="text-sm text-muted-foreground">
            {user.first_name}
          </span>
        </div>
      )}
    </header>
  )
}
