'use client'

import type { ReactNode } from 'react'

import { useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * Collapsible panel with the same chrome as the platform event page's
 * "Rules & Resolution" accordion (`EventRules`), used for the pool market's
 * rules and jury sections.
 */

interface PoolAccordionPanelProps {
  children: ReactNode
  initialExpanded: boolean
  title: string
  titleAdornment?: ReactNode
}

export default function PoolAccordionPanel({
  children,
  initialExpanded,
  title,
  titleAdornment,
}: PoolAccordionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded)

  return (
    <section className="overflow-hidden rounded-xl border bg-card transition-all duration-500 ease-in-out">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          `flex h-18 w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none`,
        )}
        aria-expanded={isExpanded}
      >
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-base font-medium">{title}</h3>
          {titleAdornment}
        </div>
        <div className="flex shrink-0 items-center">
          <span aria-hidden="true" className="pointer-events-none flex size-8 items-center justify-center">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className={cn('size-6 text-muted-foreground transition-transform', { 'rotate-180': isExpanded })}
            >
              <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </button>

      <div
        className={cn(
          `grid overflow-hidden transition-all duration-500 ease-in-out ${
            isExpanded
              ? 'pointer-events-auto grid-rows-[1fr] opacity-100'
              : 'pointer-events-none grid-rows-[0fr] opacity-0'
          }`,
        )}
        aria-hidden={!isExpanded}
      >
        <div className={cn('min-h-0 overflow-hidden', { 'border-t border-border/30': isExpanded })}>{children}</div>
      </div>
    </section>
  )
}
