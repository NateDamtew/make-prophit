'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SearchIcon } from 'lucide-react'
import { useState } from 'react'

import type { AdminLedgerUser } from '@/lib/admin-ui/mobile-money-admin'

import { formatAbsolute } from '@/components/admin-ui/format'
import { PageHeader } from '@/components/admin-ui/PageHeader'
import { StatusBadge } from '@/components/admin-ui/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

interface LedgerEntryRow {
  id: string
  transactionId: string
  side: 'debit' | 'credit'
  amountMinor: string
  currency: string
  balanceAfterMinor: string
  kind: string
  description: string | null
  referenceType: string | null
  referenceId: string | null
  createdAt: string
}

function money(minor: string, currency: string | null) {
  const value = BigInt(minor)
  const negative = value < 0n
  const abs = negative ? -value : value
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const frac = (abs % 100n).toString().padStart(2, '0')
  return `${negative ? '-' : ''}${whole}.${frac}${currency ? ` ${currency}` : ''}`
}

async function lookup(q: string): Promise<{ user: AdminLedgerUser; entries: LedgerEntryRow[] } | null> {
  const res = await fetch(`/admin/api/mobile-money/ledger?q=${encodeURIComponent(q)}`)
  if (!res.ok) {
    throw new Error(`Lookup failed (${res.status})`)
  }
  return ((await res.json()) as { data: { user: AdminLedgerUser; entries: LedgerEntryRow[] } | null }).data
}

export function LedgerManager() {
  const [input, setInput] = useState('')
  const [term, setTerm] = useState('')
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['admin-ledger', term],
    queryFn: () => lookup(term),
    enabled: term.length > 0,
    staleTime: 5_000,
  })

  const freeze = useMutation({
    mutationFn: async (body: { userId: string; withdrawalsFrozen?: boolean; tradingFrozen?: boolean }) => {
      const res = await fetch('/admin/api/mobile-money/ledger', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        throw new Error(json.error ?? 'Update failed')
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-ledger', term] }),
  })

  const data = query.data

  return (
    <section className="grid gap-6">
      <PageHeader
        title="Ledger"
        description="Look up a user's local-currency balance, holds and statement. Manual adjustments are finance-only and audit-logged."
      />

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="ledger-search" className="text-xs">
            Email, username, user id, or phone number
          </Label>
          <Input
            id="ledger-search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setTerm(input.trim())
              }
            }}
            placeholder="nate@example.com or 254703456789"
          />
        </div>
        <Button onClick={() => setTerm(input.trim())} disabled={!input.trim()}>
          <SearchIcon className="mr-2 size-4" /> Look up
        </Button>
      </Card>

      {query.isLoading && term && <p className="text-sm text-muted-foreground">Looking up…</p>}
      {query.error && <p className="text-sm text-destructive">{(query.error as Error).message}</p>}
      {term && !query.isLoading && !data && !query.error && (
        <p className="text-sm text-muted-foreground">No user matched that search.</p>
      )}

      {data && (
        <>
          <Card className="grid gap-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">{data.user.label}</h3>
                <p className="font-mono text-xs text-muted-foreground">
                  {data.user.email} · {data.user.userId}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.user.withdrawalsFrozen && <StatusBadge status="paused" />}
                {data.user.currency ? <StatusBadge status="active" /> : <StatusBadge status="pending" />}
              </div>
            </div>

            {data.user.currency ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat label="Balance" value={money(data.user.balanceMinor, data.user.currency)} />
                <Stat label="Held" value={money(data.user.reservedMinor, data.user.currency)} />
                <Stat label="Available" value={money(data.user.availableMinor, data.user.currency)} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This user has not made a mobile-money deposit yet, so no ledger currency is set.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <FreezeRow
                label="Withdrawals"
                frozen={data.user.withdrawalsFrozen}
                disabled={!data.user.currency || freeze.isPending}
                onChange={(frozen) => freeze.mutate({ userId: data.user.userId, withdrawalsFrozen: frozen })}
              />
              <FreezeRow
                label="Trading"
                frozen={data.user.tradingFrozen}
                disabled={!data.user.currency || freeze.isPending}
                onChange={(frozen) => freeze.mutate({ userId: data.user.userId, tradingFrozen: frozen })}
              />
            </div>
            {freeze.error && <p className="text-sm text-destructive">{(freeze.error as Error).message}</p>}

            {data.user.activeReservations.length > 0 && (
              <div className="grid gap-1 text-xs">
                <p className="font-medium">Active holds</p>
                {data.user.activeReservations.map((reservation) => (
                  <div key={reservation.id} className="flex flex-wrap justify-between gap-2 text-muted-foreground">
                    <span className="font-mono">
                      {reservation.referenceType} {reservation.referenceId.slice(-8)}
                    </span>
                    <span>{money(reservation.amountMinor, data.user.currency)}</span>
                    <span>{formatAbsolute(reservation.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {data.user.currency && (
            <AdjustmentForm
              user={data.user}
              onDone={() => void queryClient.invalidateQueries({ queryKey: ['admin-ledger', term] })}
            />
          )}

          <Card className="gap-0 p-0">
            <div className="border-b border-border/50 px-5 py-3 text-sm font-medium">
              Statement ({data.entries.length} most recent)
            </div>
            {data.entries.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">No entries yet.</p>
            ) : (
              <ul className="divide-y divide-border/50">
                {data.entries.map((entry) => {
                  const signed =
                    entry.side === 'credit'
                      ? `+${money(entry.amountMinor, null)}`
                      : `-${money(entry.amountMinor, null)}`
                  return (
                    <li
                      key={entry.id}
                      className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-6"
                    >
                      <div>
                        <div className="font-medium capitalize">{entry.kind.replace(/_/g, ' ')}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.description ?? ''}
                          {entry.referenceId ? ` · ${entry.referenceType} ${entry.referenceId.slice(-8)}` : ''}
                        </div>
                      </div>
                      <div className={`font-mono ${entry.side === 'credit' ? 'text-(--yes)' : 'text-foreground'}`}>
                        {signed}
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>bal {money(entry.balanceAfterMinor, entry.currency)}</div>
                        <div>{formatAbsolute(entry.createdAt)}</div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}

function FreezeRow({
  label,
  frozen,
  disabled,
  onChange,
}: {
  label: string
  frozen: boolean
  disabled: boolean
  onChange: (frozen: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{frozen ? 'Frozen (finance can unfreeze)' : 'Allowed'}</p>
      </div>
      <Switch
        checked={!frozen}
        disabled={disabled}
        onCheckedChange={(checked) => onChange(!checked)}
        aria-label={`${label} allowed`}
      />
    </div>
  )
}

function AdjustmentForm({ user, onDone }: { user: AdminLedgerUser; onDone: () => void }) {
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit')
  const [category, setCategory] = useState<'goodwill' | 'correction' | 'refund' | 'chargeback' | 'other'>('correction')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [idempotencyKey] = useState(() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
  const mutation = useMutation({
    mutationFn: async () => {
      const trimmed = amount.trim()
      if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
        throw new Error('Enter an amount with up to two decimals.')
      }
      const [whole, frac = ''] = trimmed.split('.')
      const amountMinor = (BigInt(whole) * 100n + BigInt(`${frac}00`.slice(0, 2))).toString()
      const res = await fetch('/admin/api/mobile-money/ledger', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: user.userId,
          currency: user.currency,
          direction,
          amountMinor,
          category,
          reason: reason.trim(),
          idempotencyKey,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        throw new Error(json.error ?? 'Adjustment failed')
      }
    },
    onSuccess: () => {
      setAmount('')
      setReason('')
      onDone()
    },
  })

  return (
    <Card className="grid gap-3 border-amber-500/40 bg-amber-500/5 p-5">
      <p className="text-sm font-medium">Manual adjustment (finance)</p>
      <p className="text-xs text-muted-foreground">
        Moves money between the house suspense account and this user. Use for confirmed corrections only; every
        adjustment is a ledger transaction and an audit entry.
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="grid gap-1.5">
          <Label className="text-xs">Direction</Label>
          <Select value={direction} onValueChange={(value) => setDirection(value as 'credit' | 'debit')}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="credit">Credit user</SelectItem>
              <SelectItem value="debit">Debit user</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Category</Label>
          <Select value={category} onValueChange={(value) => setCategory(value as typeof category)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="correction">Correction</SelectItem>
              <SelectItem value="goodwill">Goodwill</SelectItem>
              <SelectItem value="refund">Refund</SelectItem>
              <SelectItem value="chargeback">Chargeback</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label className="text-xs">Amount ({user.currency})</Label>
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
        </div>
      </div>
      <Textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason (required, min 5 characters) — reference the ticket or statement line"
        rows={2}
      />
      {mutation.error && <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>}
      <div>
        <Button
          size="sm"
          disabled={mutation.isPending || reason.trim().length < 5 || !amount.trim()}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Posting…' : `Post ${direction}`}
        </Button>
      </div>
    </Card>
  )
}
