import type { Metadata } from 'next'
import { ArrowRightIcon, BookOpenIcon, BotIcon, RocketIcon, TerminalIcon } from 'lucide-react'
import { getExtracted, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { isAddress, zeroAddress } from 'viem'
import SettingsSdkDownloadsContent from '@/app/[locale]/(platform)/settings/_components/SettingsSdkDownloadsContent'
import SettingsAgentsContent from '@/app/[locale]/(platform)/settings/agents/_components/SettingsAgentsContent'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { addressToBuilderCode } from '@/lib/builder-code'
import { DEFAULT_FEE_RECEIVER_WALLET_ADDRESS } from '@/lib/contracts'
import { AgentRepository } from '@/lib/db/queries/agents'
import { SettingsRepository } from '@/lib/db/queries/settings'
import { UserRepository } from '@/lib/db/queries/user'
import { getBlockedCountriesFromSettings } from '@/lib/geoblock-settings'
import resolveSiteUrl from '@/lib/site-url'

const SDK_DOWNLOAD_URL = process.env.SDK_DOWNLOAD_URL!

interface AgentsRouteParams {
  // Typed routes regenerate on the next build; until then we use a hand-rolled
  // shape that mirrors PageProps<'/[locale]/settings/agents'>.
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: AgentsRouteParams): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getExtracted()
  return { title: t('Agents') }
}

export default async function AgentsSettingsPage({ params }: AgentsRouteParams) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getExtracted()

  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    notFound()
  }

  // Settings + SDK download params (carried over verbatim from the SDKs page,
  // since SDKs now live inside Agents).
  const { data: allSettings } = await SettingsRepository.getSettings()
  const siteUrl = resolveSiteUrl(process.env)
  const feeReceiverSetting = allSettings?.general?.fee_recipient_wallet?.value
  const feeReceiver
    = feeReceiverSetting && isAddress(feeReceiverSetting) && feeReceiverSetting.toLowerCase() !== zeroAddress
      ? feeReceiverSetting
      : DEFAULT_FEE_RECEIVER_WALLET_ADDRESS
  const builderCode = addressToBuilderCode(feeReceiver)
  const geoblock = getBlockedCountriesFromSettings(allSettings ?? undefined).length > 0

  function buildDownloadUrl(language: 'python' | 'rust' | 'typescript', sdk: 'clob' | 'relayer') {
    const url = new URL('/download', SDK_DOWNLOAD_URL)
    url.searchParams.set('sdk', sdk)
    url.searchParams.set('language', language)
    url.searchParams.set('site_url', siteUrl)
    if (sdk === 'clob') {
      url.searchParams.set('builder_code', builderCode)
      url.searchParams.set('geoblock', geoblock ? 'true' : 'false')
    }
    return url.toString()
  }

  // Load this user's agents.
  const { data: agents } = await AgentRepository.listByUser(user.id)

  return (
    <section className="grid gap-10">
      {/* Page header */}
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <BotIcon className="size-6 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">{t('Agents')}</h1>
        </div>
        <p className="text-muted-foreground">
          Register AI agents, get API credentials, and let them build, trade, and compete on the leaderboard.
          Read access is live; agent trading goes live with mainnet.
        </p>
      </div>

      {/* My Agents */}
      <SettingsAgentsContent initialAgents={agents ?? []} />

      {/* Integration cards — REST API, MCP, agent trading roadmap */}
      <div className="grid gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Connect</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Link
            href={'/docs/api-reference' as never}
            className="group grid gap-2 rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
          >
            <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <TerminalIcon className="size-5" />
            </div>
            <div className="grid gap-0.5">
              <p className="text-sm font-semibold">REST API</p>
              <p className="text-xs text-muted-foreground">
                Read markets, prices, history. Public + rate-limited.
              </p>
            </div>
            <span className="mt-1 inline-flex items-center text-xs font-medium text-primary">
              Open docs
              <ArrowRightIcon className="ml-0.5 size-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>

          <div className="grid gap-2 rounded-lg border bg-card p-4">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <RocketIcon className="size-5" />
            </div>
            <div className="grid gap-0.5">
              <p className="text-sm font-semibold">MCP server</p>
              <p className="text-xs text-muted-foreground">
                Connect Claude Desktop, Cursor, or any MCP client.
              </p>
            </div>
            <span className="
              mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-bold
              tracking-wide text-amber-600 uppercase
            "
            >
              Coming soon
            </span>
          </div>

          <div className="grid gap-2 rounded-lg border bg-card p-4">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <BotIcon className="size-5" />
            </div>
            <div className="grid gap-0.5">
              <p className="text-sm font-semibold">Agent trading</p>
              <p className="text-xs text-muted-foreground">
                Place orders through agent credentials, with spending limits enforced.
              </p>
            </div>
            <span className="
              mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-bold
              tracking-wide text-amber-600 uppercase
            "
            >
              Live at mainnet
            </span>
          </div>
        </div>
      </div>

      {/* SDKs — preserved from the old page, now under Agents */}
      <div className="grid gap-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold tracking-tight">{t('SDK Downloads')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('Build trading bots and integrations with personalized SDK bundles. The CLOB client handles orderbook trading, while the Relayer client helps route and execute signed actions.')}
          </p>
        </div>

        <SettingsSdkDownloadsContent
          generatingLabel={t('Generating...')}
          cards={[
            {
              id: 'python-client',
              title: t('Python Client'),
              description: t('CLOB and relayer bundles for Python bots and services.'),
              logoSrc: '/images/sdks/python.svg',
              actions: [
                { id: 'python-clob', label: t('CLOB'), href: buildDownloadUrl('python', 'clob'), variant: 'default' },
                { id: 'python-relayer', label: t('Relayer'), href: buildDownloadUrl('python', 'relayer'), variant: 'outline' },
              ],
            },
            {
              id: 'rust-client',
              title: t('Rust Client'),
              description: t('CLOB and relayer bundles for Rust services and automations.'),
              logoSrc: '/images/sdks/rust.svg',
              actions: [
                { id: 'rust-clob', label: t('CLOB'), href: buildDownloadUrl('rust', 'clob'), variant: 'default' },
                { id: 'rust-relayer', label: t('Relayer'), href: buildDownloadUrl('rust', 'relayer'), variant: 'outline' },
              ],
            },
            {
              id: 'typescript-client',
              title: t('TypeScript Client'),
              description: t('CLOB and relayer bundles for web apps, bots, and Node.js services.'),
              logoSrc: '/images/sdks/typescript.svg',
              actions: [
                { id: 'typescript-clob', label: t('CLOB'), href: buildDownloadUrl('typescript', 'clob'), variant: 'default' },
                { id: 'typescript-relayer', label: t('Relayer'), href: buildDownloadUrl('typescript', 'relayer'), variant: 'outline' },
              ],
            },
          ]}
        />

        <div className="
          flex flex-col gap-4 rounded-lg border bg-card p-4
          sm:flex-row sm:items-center sm:justify-between sm:p-6
        "
        >
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <BookOpenIcon className="size-5" />
            </div>
            <div className="grid gap-1">
              <h3 className="text-base font-semibold tracking-tight">{t('Need implementation examples?')}</h3>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {t('Read the SDK documentation for CLOB trading, relayer wallet actions, and market maker workflows.')}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full sm:w-auto" nativeButton={false} render={<Link href="/docs/api-reference/clients-sdks" />}>
              {t('Open documentation')}
              <ArrowRightIcon className="size-4" />
            </Button>
        </div>
      </div>
    </section>
  )
}
