import { BadgeCheckIcon } from 'lucide-react'

interface WhiteLabelBrandBarProps {
  communityName: string
  communityIcon: string | null
}

/**
 * Slim brand bar shown at the top of a verified, white-label-opted-in
 * community page. The community's name and logo dominate; a small
 * "powered by Prophit" link keeps the substrate visible without competing.
 */
export function WhiteLabelBrandBar({ communityName, communityIcon }: WhiteLabelBrandBarProps) {
  return (
    <div className="rounded-sm border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-base">
          {communityIcon
            ? <img src={communityIcon} alt="" className="size-full rounded-sm object-cover" />
            : '🏛️'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            <span>{communityName}</span>
            {' '}
            <BadgeCheckIcon className="ms-1 inline size-3.5 text-primary" aria-label="Verified" />
          </p>
          <p className="text-2xs text-muted-foreground">
            Independent prediction markets, hosted on
            {' '}
            <a href="/" className="font-medium hover:underline">Prophit</a>
          </p>
        </div>
      </div>
    </div>
  )
}
