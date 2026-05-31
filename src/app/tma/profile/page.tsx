'use client'

import Image from 'next/image'
import TmaBottomNav from '../_components/TmaBottomNav'
import TmaHeader from '../_components/TmaHeader'
import { useTmaUser } from '../_components/TmaProvider'

export default function TmaProfilePage() {
  const user = useTmaUser()

  return (
    <main className="flex flex-col pb-20">
      <TmaHeader title="Profile" />
      <div className="flex flex-col items-center gap-4 p-8">
        {user
          ? (
              <>
                {user.photo_url && (
                  <Image
                    src={user.photo_url}
                    alt={user.first_name}
                    width={80}
                    height={80}
                    className="rounded-full"
                  />
                )}
                <div className="text-center">
                  <p className="text-lg font-semibold">
                    {user.first_name}
                    {user.last_name ? ` ${user.last_name}` : ''}
                  </p>
                  {user.username && (
                    <p className="text-sm text-muted-foreground">
                      @
                      {user.username}
                    </p>
                  )}
                </div>
              </>
            )
          : (
              <p className="text-sm text-muted-foreground">Open this app inside Telegram to see your profile.</p>
            )}
      </div>
      <TmaBottomNav />
    </main>
  )
}
