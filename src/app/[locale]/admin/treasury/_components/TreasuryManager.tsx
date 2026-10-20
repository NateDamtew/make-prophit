'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BanknoteIcon, LandmarkIcon, PiggyBankIcon, UsersIcon } from 'lucide-react'
import { useState } from 'react'

import type { TreasuryCurrencySummary, TreasurySummary } from '@/lib/admin-ui/mobile-money-admin'

import { formatAbsolute, formatRelativeTime } from '@/components/admin-ui/format'
import { KpiCard } from '@/components/admin-ui/KpiCard'
import { PageHeader } from '@/components/admin-ui/PageHeader'
import { StatusBadge } from '@/components/admin-ui/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

function money(minor: string | null | undefined, currency: string) {
  if (minor === null || minor === undefined) {
    return '—'
  }
  const value = BigInt(minor)
  const negative = value < 0n
  const abs = negative ? -value : value
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const frac = (abs % 100n).toString().padStart(2, '0')
  return `${negative ? '-' : ''}${whole}.${frac} ${currency}`
}

function minorToMajorInput(minor: string) {
  const value = BigInt(minor)
  return `${value / 100n}${value % 100n ? `.${(value % 100n).toString().padStart(2, '0')}` : ''}`
}

function majorInputToMinor(input: string): string | null {
  const trimmed = input.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null
  }
  const [whole, frac = ''] = trimmed.split('.')
  return (BigInt(whole) * 100n + BigInt(`${frac}00`.slice(0, 2))).toString()
}

async function fetchTreasury(): Promise<TreasurySummary> {
  const res = await fetch('/admin/api/mobile-money/treasury')
  if (!res.ok) {
    throw new Error(`Failed to load treasury (${res.status})`)
  }
  return ((await res.json()) as { data: TreasurySummary }).data
}

async function patchSettings(body: Record<string, unknown>) {
  const res = await fetch('/admin/api/mobile-money/settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as { error?: string }
  if (!res.ok) {
    throw new Error(json.error ?? 'Update failed')
  }
  return json
}

export function TreasuryManager() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['admin-treasury'],
    queryFn: fetchTreasury,
    staleTime: 15_000,
    refetchInterval: 60_000,
  })
  const mutation = useMutation({
    mutationFn: patchSettings,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-treasury'] }),
  })
  const refreshRates = useMutation({
    mutationFn: async () => {
      const res = await fetch('/admin/api/mobile-money/fx', { method: 'POST' })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        throw new Error(json.error ?? 'Refresh failed')
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-treasury'] }),
  })

  const data = query.data
  const primary = data?.currencies[0]

  return (
    <section className="grid gap-6">
      <PageHeader
        title="Treasury"
        description="Mobile-money float, user balances, reference rates and the pause switches for each currency."
        actions={
          <div className="flex items-center gap-2">
            {data && (
              <Badge variant="outline" className="font-mono text-xs">
                pawaPay {data.pawaPayEnvironment}
                {data.pawaPayConfigured ? '' : ' · no token'}
              </Badge>
            )}
            <Button size="sm" variant="outline" disabled={refreshRates.isPending} onClick={() => refreshRates.mutate()}>
              {refreshRates.isPending ? 'Refreshing…' : 'Refresh rates'}
            </Button>
          </div>
        }
      />

      {query.error && <p className="text-sm text-destructive">{(query.error as Error).message}</p>}
      {data?.pawaPayError && (
        <p className="text-sm text-amber-600">pawaPay wallet balances unavailable: {data.pawaPayError}</p>
      )}
      {mutation.error && <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>}
      {refreshRates.error && <p className="text-sm text-destructive">{(refreshRates.error as Error).message}</p>}

      {data && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-medium">Mobile money rail</p>
            <p className="text-xs text-muted-foreground">
              {data.enabled
                ? 'Users can see the Mobile money option in the wallet.'
                : 'Hidden from users. Deposits and withdrawals are off.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="rail-enabled" className="text-sm">
              {data.enabled ? 'On' : 'Off'}
            </Label>
            <Switch
              id="rail-enabled"
              checked={data.enabled}
              disabled={mutation.isPending}
              onCheckedChange={(checked) => mutation.mutate({ enabled: checked })}
            />
          </div>
        </Card>
      )}

      {primary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="User balances"
            value={money(primary.userBalancesMinor, primary.currency)}
            icon={UsersIcon}
            hint={`${money(primary.userReservedMinor, primary.currency)} held`}
          />
          <KpiCard
            label="Float (ledger)"
            value={money(primary.floatMinor, primary.currency)}
            icon={LandmarkIcon}
            hint={
              primary.pawaPayWalletMinor
                ? `pawaPay wallet ${money(primary.pawaPayWalletMinor, primary.currency)}`
                : 'pawaPay wallet unknown'
            }
          />
          <KpiCard
            label="Fees earned"
            value={money(primary.feesMinor, primary.currency)}
            icon={PiggyBankIcon}
            hint={`rounding ${money(primary.roundingMinor, primary.currency)}`}
          />
          <KpiCard
            label="Today"
            value={`${primary.depositsToday.count} in · ${primary.payoutsToday.count} out`}
            icon={BanknoteIcon}
            hint={`${money(primary.depositsToday.amountMinor, primary.currency)} in, ${money(primary.payoutsToday.amountMinor, primary.currency)} out`}
          />
        </div>
      )}

      {data?.currencies.map((currency) => (
        <CurrencyPanel
          key={currency.currency}
          summary={currency}
          onSave={(config) => mutation.mutateAsync({ currency: currency.currency, config })}
          saving={mutation.isPending}
        />
      ))}

      {data && <p className="text-xs text-muted-foreground">Generated {formatAbsolute(data.generatedAt)}</p>}
    </section>
  )
}

function CurrencyPanel({
  summary,
  onSave,
  saving,
}: {
  summary: TreasuryCurrencySummary
  onSave: (config: Record<string, unknown>) => Promise<unknown>
  saving: boolean
}) {
  const [marginBps, setMarginBps] = useState(String(summary.marginBps))
  const [withdrawalFee, setWithdrawalFee] = useState(minorToMajorInput(summary.withdrawalFeeMinor))
  const [floatTarget, setFloatTarget] = useState(minorToMajorInput(summary.floatTargetMinor))
  const [exposureCap, setExposureCap] = useState(minorToMajorInput(summary.exposureCapMinor))
  const [rateOverride, setRateOverride] = useState(summary.rate?.isOverride ? String(summary.rate.ratePerUsd) : '')
  const [error, setError] = useState<string | null>(null)

  const floatVsTarget =
    BigInt(summary.floatTargetMinor) > 0n
      ? Number((BigInt(summary.floatMinor) * 100n) / BigInt(summary.floatTargetMinor))
      : null

  async function save() {
    setError(null)
    const fee = majorInputToMinor(withdrawalFee)
    const target = majorInputToMinor(floatTarget)
    const cap = majorInputToMinor(exposureCap)
    const margin = Number.parseInt(marginBps, 10)
    if (fee === null || target === null || cap === null || !Number.isFinite(margin)) {
      setError('Please check the numbers: amounts accept up to two decimals, margin is whole basis points.')
      return
    }
    const override = rateOverride.trim() ? Number(rateOverride) : null
    if (override !== null && !(override > 0)) {
      setError('Rate override must be a positive number or empty.')
      return
    }
    try {
      await onSave({
        marginBps: margin,
        withdrawalFeeMinor: fee,
        floatTargetMinor: target,
        exposureCapMinor: cap,
        rateOverridePerUsd: override,
      })
    } catch (saveError) {
      setError((saveError as Error).message)
    }
  }

  return (
    <Card className="grid gap-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">
            {summary.currency} · {summary.country}
          </h3>
          <p className="text-xs text-muted-foreground">
            {summary.pendingDeposits} pending deposit(s) · {summary.pendingPayouts} pending payout(s)
            {floatVsTarget !== null ? ` · float at ${floatVsTarget}% of target` : ' · no float target set'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {summary.depositsPaused && <StatusBadge status="paused" />}
          {summary.payoutsPaused && <StatusBadge status="paused" />}
          {summary.rate ? (
            <Badge variant="outline" className="font-mono text-xs">
              1 USD = {summary.rate.ratePerUsd.toFixed(2)} {summary.currency} · {summary.rate.source}
              {summary.rate.stale ? ' · stale' : ''}
              {summary.rate.paused ? ' · JUMP' : ''}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              no reference rate yet
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <PauseSwitch
          label="Deposits"
          paused={summary.depositsPaused}
          disabled={saving}
          onChange={(paused) => onSave({ depositsPaused: paused })}
        />
        <PauseSwitch
          label="Withdrawals"
          paused={summary.payoutsPaused}
          disabled={saving}
          onChange={(paused) => onSave({ payoutsPaused: paused })}
        />
        <PauseSwitch
          label="Order-book trading"
          paused={summary.tradingPaused}
          disabled={saving}
          onChange={(paused) => onSave({ tradingPaused: paused })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Margin (bps)" value={marginBps} onChange={setMarginBps} hint="Applied to order-book trades" />
        <Field label={`Withdrawal fee (${summary.currency})`} value={withdrawalFee} onChange={setWithdrawalFee} />
        <Field
          label={`Float target (${summary.currency})`}
          value={floatTarget}
          onChange={setFloatTarget}
          hint="10–14 days of payouts"
        />
        <Field
          label={`Exposure cap (${summary.currency})`}
          value={exposureCap}
          onChange={setExposureCap}
          hint="Open fixed payouts; 0 = off"
        />
        <Field
          label="Rate override (per USD)"
          value={rateOverride}
          onChange={setRateOverride}
          hint="Empty = use feed"
        />
      </div>

      {summary.rate && (
        <p className="text-xs text-muted-foreground">
          Rate fetched {formatRelativeTime(summary.rate.fetchedAt)} · effective margin {summary.rate.effectiveMarginBps}{' '}
          bps
          {summary.rate.jumpBps !== null ? ` · last move ${summary.rate.jumpBps} bps` : ''}
          {summary.rate.paused ? ' · order-book quotes paused by the jump rail' : ''}
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        <Button size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save currency settings'}
        </Button>
      </div>
    </Card>
  )
}

function PauseSwitch({
  label,
  paused,
  disabled,
  onChange,
}: {
  label: string
  paused: boolean
  disabled: boolean
  onChange: (paused: boolean) => Promise<unknown>
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{paused ? 'Paused' : 'Running'}</p>
      </div>
      <Switch
        checked={!paused}
        disabled={disabled}
        onCheckedChange={(checked) => void onChange(!checked)}
        aria-label={`${label} running`}
      />
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
