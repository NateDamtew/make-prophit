'use client'

import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

/** The call to lead a community, worded for the page it sits on. */
export function StartCommunityCta({ title, body, action }: { title: string; body: string; action: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-[17px] font-bold">{title}</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{body}</p>
      </div>
      <Button nativeButton={false} render={<Link href="/communities/apply" />} className="shrink-0">
        {action}
      </Button>
    </section>
  )
}
