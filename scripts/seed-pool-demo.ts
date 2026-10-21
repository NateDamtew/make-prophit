/**
 * Seed a demo community with pool markets so the local-currency flow can be
 * seen end to end, and credit one account with test KES to stake with.
 *
 * Usage (run AFTER the ledger/pool migrations have been applied, i.e. after
 * the first deploy of this branch):
 *
 *   SEED_CONFIRM=1 POSTGRES_URL='postgres://…' bun scripts/seed-pool-demo.ts --user <address|username|email>
 *
 * Options:
 *   --user       the account that becomes community admin + juror and receives the balance (required)
 *   --juror      another account to seat as juror (repeatable); also receives the balance
 *   --tester     another account to add as member (repeatable); also receives the balance
 *   --balance    test balance in KES to credit to every account above, default 20000 (0 to skip)
 *   --jury-size  jury seats for the community, default 3 (updates an existing community when passed)
 *   --slug       community slug, default prophit-kenya
 *
 * Every account must have signed in on the site once. Pool markets need at
 * least 3 seated jurors (admin counts), so pass two --juror accounts for the
 * demo community to be able to resolve.
 *
 * Idempotent: re-running reuses the community, skips markets that exist, and
 * never credits the same balance twice (ledger idempotency key).
 *
 * The balance is booked from the house `suspense` account with kind
 * `seed_funding`; reverse it with the same amount the other way when the demo
 * is over, or leave it on a beta database that only runs free-to-play.
 */

import { eq, or, sql } from 'drizzle-orm'

const confirm = process.env.SEED_CONFIRM === '1'
const databaseUrl = process.env.POSTGRES_URL ?? ''
if (!databaseUrl) {
  console.error('POSTGRES_URL is not set.')
  process.exit(1)
}
const host = (() => {
  try {
    return new URL(databaseUrl).host
  } catch {
    return '(unparseable url)'
  }
})()
if (!confirm) {
  console.error(`Refusing to seed ${host}. Re-run with SEED_CONFIRM=1 once you have checked the host.`)
  process.exit(1)
}

function readArg(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1 || !process.argv[index + 1]) {
    return fallback
  }
  return process.argv[index + 1]
}

function readArgs(name: string): string[] {
  const values: string[] = []
  process.argv.forEach((arg, index) => {
    if (arg === `--${name}` && process.argv[index + 1]) {
      values.push(process.argv[index + 1]!)
    }
  })
  return values
}

const userRef = readArg('user')
const jurorRefs = readArgs('juror')
const testerRefs = readArgs('tester')
const slug = readArg('slug', 'prophit-kenya')!
const balanceMajor = Number.parseInt(readArg('balance', '20000')!, 10)
const jurySizeArg = readArg('jury-size')
const jurySize = Number.parseInt(jurySizeArg ?? '3', 10)
if (!userRef) {
  console.error('Pass --user <wallet address | username | email>.')
  process.exit(1)
}
if (!Number.isInteger(jurySize) || jurySize < 1 || jurySize > 10) {
  console.error('--jury-size must be a whole number between 1 and 10.')
  process.exit(1)
}

const { db } = await import('@/lib/drizzle')
const { users } = await import('@/lib/db/schema/auth/tables')
const { communities, community_markets, community_members } = await import('@/lib/db/schema/communities/tables')
const { LedgerService } = await import('@/lib/ledger/service')
const { openPoolForMarket } = await import('@/lib/pools/service')

const CURRENCY = 'KES'

console.log(`Seeding ${host} …`)

// ── users ─────────────────────────────────────────────────────────────────
async function findUser(reference: string) {
  const ref = reference.trim()
  const [row] = await db
    .select({ id: users.id, username: users.username, address: users.address })
    .from(users)
    .where(
      or(
        sql`LOWER(${users.address}) = ${ref.toLowerCase()}`,
        sql`LOWER(${users.username}) = ${ref.replace(/^@/, '').toLowerCase()}`,
        sql`LOWER(${users.email}) = ${ref.toLowerCase()}`,
      ),
    )
    .limit(1)
  if (!row) {
    console.error(`No user matches "${ref}". Sign in on the site once so the account exists, then re-run.`)
    process.exit(1)
  }
  return row
}

const user = await findUser(userRef)
console.log(`Admin: ${user.username ?? user.address ?? user.id}`)
const jurors = []
for (const ref of jurorRefs) {
  jurors.push(await findUser(ref))
}
const testers = []
for (const ref of testerRefs) {
  testers.push(await findUser(ref))
}

// ── community ─────────────────────────────────────────────────────────────
const [existingCommunity] = await db.select().from(communities).where(eq(communities.slug, slug)).limit(1)
const community =
  existingCommunity ??
  (
    await db
      .insert(communities)
      .values({
        slug,
        name: 'Prophit Kenya',
        description:
          'Demo community for local-currency markets. Stake in Kenyan shillings; a community jury resolves each market.',
        rules: 'Be respectful. Jurors must cite the resolution source when voting.',
        type: 'public',
        jury_size: jurySize,
        max_members: 50,
        creator_id: user.id,
        tier: 'pool',
        currency: CURRENCY,
        member_count: 1,
      } as never)
      .returning()
  )[0]!
console.log(`${existingCommunity ? 'Reusing' : 'Created'} community /community/${community.slug}`)
if (existingCommunity && jurySizeArg && existingCommunity.jury_size !== jurySize) {
  await db.update(communities).set({ jury_size: jurySize }).where(eq(communities.id, community.id))
  console.log(`Jury size ${existingCommunity.jury_size} → ${jurySize}`)
}

async function seatMember(memberId: string, role: 'admin' | 'juror' | 'member') {
  await db
    .insert(community_members)
    .values({ community_id: community.id, user_id: memberId, role } as never)
    .onConflictDoNothing()
  await db
    .update(community_members)
    .set({ role })
    .where(sql`${community_members.community_id} = ${community.id} AND ${community_members.user_id} = ${memberId}`)
}

await seatMember(user.id, 'admin')
for (const juror of jurors) {
  await seatMember(juror.id, 'juror')
  console.log(`Juror: ${juror.username ?? juror.address ?? juror.id}`)
}
for (const tester of testers) {
  await seatMember(tester.id, 'member')
  console.log(`Tester: ${tester.username ?? tester.address ?? tester.id}`)
}
await db
  .update(communities)
  .set({ member_count: sql`(SELECT COUNT(*)::int FROM community_members WHERE community_id = ${community.id})` })
  .where(eq(communities.id, community.id))
const seatedJurors = 1 + jurors.length
if (seatedJurors < Math.max(jurySize, 3)) {
  console.warn(
    `Only ${seatedJurors} juror(s) seated (admin included) for a jury of ${jurySize}; the jury cannot reach consensus until more jurors join. Pass --juror <user> for each extra seat.`,
  )
}

// ── markets ───────────────────────────────────────────────────────────────
function inDays(days: number) {
  return new Date(Date.now() + days * 86_400_000)
}
const demoMarkets = [
  {
    title: 'Will Nairobi record more than 100 mm of rain in November 2026?',
    description:
      'Short rains season. Resolves on the Kenya Meteorological Department monthly total for Nairobi (Dagoretti Corner).',
    resolution_source: 'https://meteo.go.ke',
    resolution_rules:
      'Resolves YES if the Kenya Meteorological Department reports a November 2026 total above 100 mm for Dagoretti Corner. Otherwise NO.',
    resolution_date: inDays(45),
    main_category_slug: 'science',
  },
  {
    title: 'Will Harambee Stars win their next AFCON qualifier?',
    description: 'Kenya national football team, next official AFCON qualifying match.',
    resolution_source: 'https://www.cafonline.com',
    resolution_rules:
      'Resolves YES on a win in regulation time. A draw or loss resolves NO. A postponed match extends the deadline.',
    resolution_date: inDays(21),
    main_category_slug: 'sports',
  },
  {
    title: 'Will petrol in Nairobi cost more than KES 200 per litre on 14 December 2026?',
    description: 'EPRA publishes maximum pump prices on the 14th of each month.',
    resolution_source: 'https://www.epra.go.ke',
    resolution_rules:
      'Resolves YES if the EPRA maximum pump price for Super Petrol in Nairobi, effective 15 December 2026, is above KES 200.00 per litre.',
    resolution_date: inDays(54),
    main_category_slug: 'economy',
  },
]

for (const demo of demoMarkets) {
  const [existing] = await db
    .select({ id: community_markets.id })
    .from(community_markets)
    .where(sql`${community_markets.community_id} = ${community.id} AND ${community_markets.title} = ${demo.title}`)
    .limit(1)
  const marketId =
    existing?.id ??
    (
      await db
        .insert(community_markets)
        .values({
          community_id: community.id,
          title: demo.title,
          description: demo.description,
          resolution_source: demo.resolution_source,
          resolution_rules: demo.resolution_rules,
          resolution_date: demo.resolution_date,
          market_mode: 'binary',
          binary_question: demo.title,
          status: 'active',
          review_status: 'approved',
          reviewed_at: new Date(),
          main_category_slug: demo.main_category_slug,
          created_by: user.id,
          engine: 'pool',
        } as never)
        .returning({ id: community_markets.id })
    )[0]!.id
  const pool = await openPoolForMarket({
    communityMarketId: marketId,
    communityId: community.id,
    closesAt: demo.resolution_date,
    currency: CURRENCY,
  })
  console.log(
    `${existing ? 'Reusing' : 'Created'} market /community/${community.slug}/market/${marketId} (pool ${pool.state})`,
  )
}
await db
  .update(communities)
  .set({ market_count: sql`(SELECT COUNT(*)::int FROM community_markets WHERE community_id = ${community.id})` })
  .where(eq(communities.id, community.id))

// ── test balances ─────────────────────────────────────────────────────────
// Consent (18+ and Terms) is deliberately NOT pre-recorded: every account sees
// the gate on its first stake, exactly like a real user would.
if (balanceMajor > 0) {
  const amount = BigInt(balanceMajor) * 100n
  for (const account of [user, ...jurors, ...testers]) {
    await LedgerService.ensureUserProfile(account.id, CURRENCY, undefined, 'KE')
    const cash = await LedgerService.getOrCreateUserCashAccount(account.id, CURRENCY)
    const suspense = await LedgerService.getOrCreateHouseAccount('suspense', CURRENCY)
    await LedgerService.postTransaction({
      kind: 'seed_funding',
      idempotencyKey: `seed:${slug}:${account.id}:${amount}`,
      entries: [
        { accountId: suspense.id, side: 'debit', amount, currency: CURRENCY },
        { accountId: cash.id, side: 'credit', amount, currency: CURRENCY },
      ],
    })
    const balance = await LedgerService.getUserBalance(account.id, CURRENCY)
    console.log(
      `Balance for ${account.username ?? account.id}: ${(Number(balance.available) / 100).toLocaleString()} ${CURRENCY}`,
    )
  }
}

console.log('Done.')
process.exit(0)
