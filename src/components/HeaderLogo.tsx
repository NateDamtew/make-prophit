'use client'

import SiteLogoIcon from '@/components/SiteLogoIcon'
import { useSiteIdentity } from '@/hooks/useSiteIdentity'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

interface HeaderLogoProps {
  labelSuffix?: string
}

export default function HeaderLogo({ labelSuffix }: HeaderLogoProps) {
  const site = useSiteIdentity()
  const label = labelSuffix ? `${site.name} ${labelSuffix}` : site.name

  return (
    <Link
      href="/"
      className={cn(`
        flex h-10 shrink-0 items-center gap-2 text-2xl font-medium text-foreground transition-opacity
        hover:opacity-80
      `)}
    >
      <SiteLogoIcon
        logoSvg={site.logoSvg}
        logoImageUrl={site.logoImageUrl}
        alt={`${site.name} logo`}
        className="size-[1em] text-current [&_svg]:size-[1em] [&_svg_*]:fill-current [&_svg_*]:stroke-current"
        imageClassName="size-[1em] object-contain"
        size={32}
      />
      <span className="relative">
        {label}
        <span
          className={cn(`
            absolute -top-2.5 right-0 inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[0.35em]
            leading-none font-semibold tracking-wider text-primary uppercase
          `)}
        >
          Beta
        </span>
      </span>
    </Link>
  )
}
