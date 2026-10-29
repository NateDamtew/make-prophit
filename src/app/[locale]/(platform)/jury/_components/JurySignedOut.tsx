'use client'

import { GavelIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'

import { Button } from '@/components/ui/button'
import { useAppKit } from '@/hooks/useAppKit'
import { Link } from '@/i18n/navigation'

/** The jury page for someone who is not signed in. */
export default function JurySignedOut() {
  const t = useExtracted()
  const { open } = useAppKit()
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-6">
      <div className="flex size-11 items-center justify-center rounded-full bg-secondary">
        <GavelIcon className="size-5" aria-hidden="true" />
      </div>
      <h1 className="text-[22px]/tight font-bold">{t('Jury duty')}</h1>
      <p className="text-sm/relaxed text-muted-foreground">
        {t('Sign in to see the markets waiting on your vote. Jurors are appointed by each community’s leader.')}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => void open()}>{t('Sign in')}</Button>
        <Button variant="secondary" nativeButton={false} render={<Link href="/communities" />}>
          {t('Browse communities')}
        </Button>
      </div>
    </div>
  )
}
