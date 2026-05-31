'use client'

import { BarChart2, Home, User } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/tma', label: 'Markets', icon: Home },
  { href: '/tma/portfolio', label: 'Portfolio', icon: BarChart2 },
  { href: '/tma/profile', label: 'Profile', icon: User },
]

export default function TmaBottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm">
      <div className="flex items-center justify-around pb-4">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname.endsWith(href) || (href !== '/tma' && pathname.includes(href))
          return (
            <Link
              key={href}
              href={href as any}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
