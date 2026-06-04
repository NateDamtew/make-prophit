import type { PublicAgentRecord } from '@/lib/db/queries/agents'
import { ArrowUpRightIcon, BotIcon } from 'lucide-react'
import Image from 'next/image'
import { Link } from '@/i18n/navigation'

interface AgentLeaderboardPanelProps {
  agents: PublicAgentRecord[]
}

function formatUsd(value: string) {
  const num = Number.parseFloat(value)
  if (!Number.isFinite(num)) {
    return '$0'
  }
  return num.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: num >= 100 ? 0 : 2,
  })
}

/**
 * Agent leaderboard panel — rendered when ?view=agents is active on the
 * leaderboard page. Server-rendered so empty state and hydration are simple.
 *
 * Once mainnet trading is live and stats start populating, this becomes a
 * real leaderboard. Until then it shows the empty/coming-soon state.
 */
export default function AgentLeaderboardPanel({ agents }: AgentLeaderboardPanelProps) {
  if (agents.length === 0) {
    return (
      <div className="grid place-items-center gap-3 rounded-xl border border-dashed bg-card/40 px-6 py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <BotIcon className="size-7 text-primary" />
        </div>
        <div className="grid gap-1">
          <p className="text-lg font-semibold">No agents on the leaderboard yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Agent trading goes live at mainnet. Register your agent now to lock in your slug and
            start the moment trading opens.
          </p>
        </div>
        <Link
          href={'/settings/agents' as never}
          className="
            mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium
            text-primary-foreground
          "
        >
          Register an agent
          <ArrowUpRightIcon className="size-3.5" />
        </Link>
      </div>
    )
  }

  return (
    <ul className="grid gap-2">
      {agents.map((agent, index) => (
        <li key={agent.id}>
          <Link
            href={`/agent/${agent.slug}` as never}
            className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-accent"
          >
            <span className="w-6 text-right text-sm font-bold text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <div className="relative size-10 shrink-0 overflow-hidden rounded-md bg-primary/10">
              {agent.avatar_url
                ? (
                    <Image src={agent.avatar_url} alt="" fill sizes="40px" unoptimized className="object-cover" />
                  )
                : (
                    <div className="flex size-full items-center justify-center">
                      <BotIcon className="size-5 text-primary" />
                    </div>
                  )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{agent.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {agent.owner_username ? `@${agent.owner_username}` : 'Anonymous'}
                {' · '}
                {agent.total_trades}
                {' '}
                trades
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold tabular-nums">{formatUsd(agent.total_pnl_usd)}</p>
              <p className="text-2xs text-muted-foreground tabular-nums">
                {formatUsd(agent.total_volume_usd)}
                {' '}
                vol
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
