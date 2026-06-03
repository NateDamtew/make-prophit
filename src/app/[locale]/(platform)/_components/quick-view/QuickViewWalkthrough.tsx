'use client'

import { ArrowLeftIcon, ArrowRightIcon, CheckCircle2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

const WALKTHROUGH_SEEN_KEY = 'quickview_walkthrough_seen'

const STEPS = [
  {
    icon: ArrowRightIcon,
    accent: 'text-yes',
    bg: 'bg-yes/10',
    title: 'Swipe right for Yes / Up',
    body: 'Think the answer is Yes — or the price goes up? Swipe the card right.',
  },
  {
    icon: ArrowLeftIcon,
    accent: 'text-no',
    bg: 'bg-no/10',
    title: 'Swipe left for No / Down',
    body: 'Think it’s No — or the price goes down? Swipe the card left.',
  },
  {
    icon: CheckCircle2Icon,
    accent: 'text-primary',
    bg: 'bg-primary/10',
    title: 'Pick an amount, then Confirm',
    body: 'Your swipe stages the trade. Choose a stake and tap Confirm — nothing is placed until you do.',
  },
] as const

/**
 * First-time coach overlay for Quick View. Shows once (persisted in
 * localStorage), explaining the swipe gestures before the user starts.
 */
export default function QuickViewWalkthrough() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    try {
      if (localStorage.getItem(WALKTHROUGH_SEEN_KEY) !== 'true') {
        setVisible(true)
      }
    }
    catch {
      // localStorage unavailable — just skip the walkthrough.
    }
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(WALKTHROUGH_SEEN_KEY, 'true')
    }
    catch {
      // ignore persistence failures
    }
    setVisible(false)
  }

  if (!visible) {
    return null
  }

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const Icon = current.icon

  return (
    <div className="absolute inset-0 z-60 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-sm rounded-3xl bg-background p-6 text-center shadow-2xl">
        <div className={`mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl ${current.bg}`}>
          <Icon className={`size-8 ${current.accent}`} />
        </div>

        <h3 className="text-lg font-bold">{current.title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{current.body}</p>

        {/* Progress dots */}
        <div className="mt-5 flex justify-center gap-1.5">
          {STEPS.map((_, dotIndex) => (
            <span
              key={dotIndex}
              className={`size-1.5 rounded-full transition-colors ${
                dotIndex === step ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={dismiss}>
            Skip
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              if (isLast) {
                dismiss()
              }
              else {
                setStep(current => current + 1)
              }
            }}
          >
            {isLast ? 'Start swiping' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  )
}
