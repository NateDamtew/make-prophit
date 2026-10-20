# Local Payments Design — pawaPay rail, omnibus custody, local-currency ledger

**Status:** design agreed in discussion on 2026-10-20, no code yet.
**Branch:** `claude/local-payments-birr-270802` (based on `custom-production`, which is production).
**Owner:** Nate. **Sandbox:** pawaPay sandbox account exists.
**Scope (2026-10-20):** **Kenya / KES only.** The rail is currency-agnostic and driven by pawaPay's
active configuration, so other currencies (ETB, UGX, TZS, GHS) are enabled later by adding a
row in `settings`, not by writing code. No birr work, UI copy, or treasury float until then.

This document is the single reference for how Prophit takes mobile money in, trades on
behalf of users, and pays mobile money out, with users never seeing USD, a wallet, or an
exchange rate. It replaces the 2026-10-06 "separate service, USD-priced positions" plan.

---

## 1. Goals and non-goals

**Goals**

- A user in Kenya signs up with a phone or email, deposits shillings via M-Pesa, trades, and
  withdraws shillings. Nothing about crypto is visible.
- Global and mirrored markets keep trading on Kuest's order book, through one house account.
- Community markets run in-house as local-currency pools, with promotion to the Kuest order
  book for communities that earn it.
- One double-entry ledger in Postgres is the source of truth for every balance and position.
- Sandbox first: KES works end to end against pawaPay sandbox before any licence or
  production token is involved.
- Currency-agnostic plumbing: nothing hard-codes KES. A second currency is a `settings` row
  (margin, fees, float target, exposure cap, enabled flag) plus pawaPay's own configuration.

**Non-goals (for this plan)**

- Replacing Kuest's matching engine for global markets (the Kalshi-style rewrite was rejected).
- Ethiopia / ETB in any form for now. Betting licences there were revoked in Dec 2025, birr is
  hard to convert out, and pawaPay has no Telebirr. The rail stays open for it via config.
- Per-user on-chain wallets. Omnibus removes them; the TON rail stays dormant.

---

## 2. Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-10-06 | Keep Kuest underneath; reject pure-fiat rewrite | Loses shared book, mirrored markets, needs a licence per country anyway |
| 2026-10-20 | Build in make-prophit, not a separate service | Ledger and trading must share a database under omnibus |
| 2026-10-20 | Omnibus custody: one house Kuest account | Sidesteps the deposit-wallet relayer blocker; phone-number onboarding |
| 2026-10-20 | Ledger balances in local currency; users never see USD | Product requirement; matches every betting app users already know |
| 2026-10-20 | House carries FX; margin baked into trade price | Consequence of fixed local payouts |
| 2026-10-20 | Deposits free, flat withdrawal fee, pool rake | Simple, familiar fee shape |
| 2026-10-20 | Community markets = in-house parimutuel pools by default | No liquidity needed, zero FX, jury resolves in the ledger |
| 2026-10-20 | Tiered promotion of communities to the Kuest order book | Shared liquidity and MM support only where there is volume |
| 2026-10-20 | Kenya / KES only; ETB dropped from scope but rail kept currency-agnostic | Ethiopia is unlicensed and birr is hard to repatriate; pawaPay makes adding a currency a config change |

---

## 3. Architecture

```
 User (phone/email)          Prophit (Next.js + Postgres)                 Outside
 ───────────────────         ─────────────────────────────                ─────────────────
 KES in       ──────────▶   pawaPay client ── payment_intents            pawaPay v2 API
 KES out      ◀──────────   callback route + status poller       ◀────▶  (deposits, payouts,
                                     │                                     callbacks)
                             LEDGER (double-entry, local minor units)
                                     │
                 ┌───────────────────┴────────────────────┐
         engine = orderbook                        engine = pool
         house-signed CLOB orders ◀──────▶ Kuest CLOB    parimutuel pool
         fills feed, redemptions           (USDC, house   jury settles
         FX at order time                   account)      no FX
                                     │
                             Treasury: fx_rate_snapshots, floats per currency,
                             house USDC, reconciliation, admin treasury page
```

Three money boundaries, and only the middle one touches dollars:

1. **Mobile money to ledger**: same currency both sides, no FX, no fee on deposit, flat fee on payout.
2. **Ledger to Kuest** (order-book markets only): local stake converted to USD at the internal
   reference rate less margin when the order is placed; USD redemption converted back at the
   payout fixed at trade time.
3. **Ledger to pool** (community markets): same currency, rake only.

---

## 4. Money model

### 4.1 Currencies and units

- Every ledger account has one currency. Users get one account in their home currency,
  chosen from the phone country at first deposit, with an explicit override in settings.
- Amounts are stored as **integer minor units** (`bigint`) plus an ISO 4217 code. The ledger
  always keeps two decimals even where a provider accepts none; the provider edge rounds
  (see 4.3). KES is the only enabled currency at launch.
- The house has accounts per currency: `float:<CCY>` (money at pawaPay), `fees:<CCY>`,
  `rounding:<CCY>`, `pool_rake:<CCY>`, `fx:<CCY>` (realised FX gain or loss), and
  `settlement:USD` (house USDC on Kuest, tracked in cents).

### 4.2 Double-entry ledger

- `ledger_entries` are immutable. Each business event is one `ledger_transactions` row with
  two or more entries that sum to zero per currency (FX events post to `fx:<CCY>` so each
  currency still balances).
- Balances are derived, cached in `ledger_accounts.balance` and `reserved` with the update
  inside the same DB transaction as the entries. A nightly job recomputes from entries and
  alerts on drift.
- **Reservations** hold funds for in-flight orders, pool stakes, and payouts. Reserved money
  is not spendable and is released on cancel or failure.

### 4.3 Rounding

Always in the house's favour, residue to `rounding:<CCY>`:

- Deposit: credit exactly what pawaPay confirmed. No conversion, no rounding.
- Order-book stake: convert local to USD, floor the USD cents; the fixed local payout is
  floored to the minor unit.
- Payout to mobile money: round the local amount down to the provider's `decimalsInAmount`
  (whole shillings for KES deposits, two places for payouts), debit the user the rounded figure.
- Pool settlement: each winner's share floored; the sum of residues goes to `rounding`.

---

## 5. Custody: omnibus house account

- One EVM key held server-side (`HOUSE_SIGNER_PRIVATE_KEY`), one Kuest deposit wallet, one set
  of CLOB trading credentials. For the Amoy beta this can be the existing account that already
  has a deployed wallet.
- Users have **no** wallet. `users.address` stays null for ledger users; all trading
  onboarding gated on `hasValidWalletAddress` is skipped, which the code already does for
  Telegram users.
- Every user order maps 1:1 to a house order on Kuest (`house_orders.user_order_id`). No
  netting in phase one, so attribution of fills is a lookup.
- House USDC on Kuest is treasury capital. It is replenished by converting local float on a
  schedule (see 8.4).
- Withdrawals require a second factor (Telegram confirm or PIN). A compromised backend plus
  custodied funds is the catastrophic scenario, and this is the one control users feel.

---

## 6. Market engines

Each market has an immutable `engine`: `orderbook` or `pool`. Each community has a `tier`:
`pool` or `orderbook`, copied onto its markets at creation.

### 6.1 Order book (Kuest): global, mirrored, and promoted-community markets

1. User enters a local stake. Server reads the latest `fx_rate_snapshots` row for the
   currency, applies the platform margin (default 1.5% for KES, in `settings`), and
   converts to USD cents.
2. Server computes shares at the current CLOB price and the **fixed local payout** =
   shares x 1 USD x rate-at-order-time, floored. This number is shown to the user and never
   changes.
3. Server reserves the local stake, writes `user_orders` and `house_orders`, builds the same
   payload `buildOrderPayload` builds today, signs with the house key, submits via the existing
   CLOB path (`src/lib/orders`, `store-order.ts` pattern).
4. Fills for the house account arrive on the existing websocket. Each fill consumes the
   reservation pro rata and credits `positions` (shares plus fixed local payout). Partial fills
   pro-rate the payout; cancels release the remainder.
5. Sell or cash-out: value = current price x current rate x (1 - margin). Reserve shares, sign a
   sell from the house, credit local proceeds on fill.
6. Resolution: when the condition resolves on Kuest, the house redeems all winning tokens once
   (`settlement:USD` up), then credits each winner their fixed local payout
   (`settlement:USD` down at the realised rate, difference to `fx:<CCY>`).

Promoted-community markets additionally need the **jury verdict pushed on-chain** through the
direct resolution oracle (`dro_moov2`) with a resolver key, otherwise the condition never
settles. Today the jury result is written only to `community_markets.resolved_outcome`;
this path must be built before any community is promoted. UMA remains the dispute backstop.

### 6.2 Pool (in-house parimutuel): community markets by default

- Opening a market creates a `pools` row (currency = community's currency, rake %, close time).
- Stake: reserve, then move to `pool_stakes` (user, outcome, amount). Implied odds shown as the
  pool split; payout shown as "estimated" because it depends on the final pool.
- No selling before close in phase one (keeps the pool simple). Cancelling a market refunds all
  stakes at face value.
- Settlement: when `jury_votes` reach the consensus threshold already defined in
  `community-config.ts`, one DB transaction: rake to `pool_rake:<CCY>` (optionally a share to
  the community creator), remaining pool split pro rata among winning stakes, residue to
  `rounding`. Losing stakes are consumed.
- Zero FX. No on-chain step. The existing creation, super-admin review, comments, evidence,
  moderation and notification flows are untouched; only the deploy hook in
  `community-deploy-hooks.ts` is swapped for "open pool" when `engine = pool`.

### 6.3 Tiering and promotion

- `communities.tier` defaults to `pool`.
- A nightly job promotes a community to `orderbook` when **all** hold over the trailing 30 days,
  thresholds in `settings`: members >= 1,000, unique traders >= 100, average pool above a
  configured local amount. Super admins can override either way (community type, e.g. a club or
  media house, justifies early promotion).
- Promotion affects **new markets only**; live pools finish as pools.
- Demotion when activity falls below thresholds for 60 days; again new markets only.
- Promoted markets become eligible for the house market-making bot or a sponsored
  market-maker campaign (upstream feature, not yet synced). Budget for it; a promoted market
  without a maker starts thin.
- Users are told what promotion gives them and that it can be revoked.

---

## 7. pawaPay integration

Facts verified against the v2 docs on 2026-10-20.

### 7.1 Endpoints used

| Purpose | Call |
|---|---|
| Providers, limits, decimals, status | `GET /v2/active-conf?country=KEN` (other countries later) |
| Phone to provider | `POST /v2/predict-provider { phoneNumber }` |
| Deposit | `POST /v2/deposits` |
| Deposit status | `GET /v2/deposits/{depositId}` |
| Payout | `POST /v2/payouts` |
| Payout status | `GET /v2/payouts/{payoutId}` |
| Cancel enqueued payout | `GET /v2/payouts/fail-enqueued/{payoutId}` |
| Provider availability | `GET /v2/availability?country=...&operationType=PAYOUT` |
| Public keys for callback verification | toolkit public-keys endpoint |

Base URLs: `https://api.sandbox.pawapay.io`, `https://api.pawapay.io`. Auth: `Authorization:
Bearer <token>`, separate tokens per environment. Launch provider: `MPESA_KEN` (KES, deposits in
whole shillings, payouts to two places). Enabled currencies and countries come from a
`payments.enabled_currencies` setting intersected with pawaPay's active configuration, so no
provider or currency code is hard-wired.

### 7.2 Client

`src/lib/pawapay/{client,types,constants}.ts`, same shape as the rhino client: thin typed REST
wrapper, no SDK, `PawaPayApiError` carrying status and body, 20 s timeouts. Active
configuration cached 10 minutes.

### 7.3 Deposit flow

1. Validate amount against provider `minAmount`, `maxAmount`, `decimalsInAmount` and our own
   per-user limits. Reject if provider status is `CLOSED`.
2. Generate `depositId` (UUID v4). Insert `payment_intents` (`kind = deposit`,
   `state = initiated`) **before** calling pawaPay, so a lost response can be reconciled.
3. POST. `ACCEPTED` sets `state = pending`. `REJECTED` sets `state = rejected` with
   `failureCode`, mapped to a user message via a new `payments-flow-errors.ts` mirroring
   `trading-flow-errors.ts`. `DUPLICATE_IGNORED` is treated as already pending.
4. Final status by callback (7.5) or poller (7.6). `COMPLETED`: ledger `float:<CCY>` +amount,
   user +amount, intent `completed`. `FAILED`: intent `failed` with reason.
   `IN_RECONCILIATION`: leave pending, keep polling.
5. Sandbox: PIN prompts are skipped; use the published KES test numbers (`254703456789`
   completes, `254703456129` stays submitted, `254703456049` fails with `INSUFFICIENT_BALANCE`,
   `254703456039` fails with `PAYMENT_NOT_APPROVED`; payouts `254703456789` complete,
   `254703456089` fail with `RECIPIENT_NOT_FOUND`).

### 7.4 Payout flow

1. Check provider status (`OPERATIONAL`, `DELAYED`, `CLOSED`), user daily limit, 2FA passed,
   `float:<CCY>` cover.
2. Compute net = amount - flat fee, rounded down to provider decimals. Reserve the gross on the
   user's account. Insert `payment_intents` (`kind = payout`, `state = initiated`) with
   `payoutId` UUID, then POST.
3. `ACCEPTED`: pending. `ENQUEUED` (provider delayed): pending with a "may take longer"
   flag surfaced to the user. `REJECTED`: release reservation.
4. `COMPLETED`: ledger user -gross (from reservation), `float:<CCY>` -net, `fees:<CCY>` +fee.
   `FAILED`: release reservation, intent failed with reason. Only `NOT_FOUND` on a status
   check is treated as "never reached pawaPay".

### 7.5 Callback route

`POST /api/payments/pawapay/callback`:

- Enable **signed callbacks** in the pawaPay dashboard. Verify `Content-Digest` against the raw
  body, rebuild the RFC 9421 signature base from `Signature-Input` (method, authority, path,
  `Signature-Date`, `Content-Digest`, `Content-Type`), verify against pawaPay's published
  public key (cached, refetched on key id miss). Reject on any mismatch.
- Look up the intent by `depositId` or `payoutId`. Unknown id: answer 200 and log, do not leak.
- Idempotent: processing is guarded by the intent's current state inside a row lock, so a
  replayed callback is a no-op.
- Always answer 200 quickly; do the ledger write inside the request but keep it to one
  transaction.
- Allowlist pawaPay's callback IPs at the edge once known.

### 7.6 Status poller

A cron under the existing `src/lib/sync/cron-route.ts` pattern, every 2 minutes: for every
intent `pending` older than 2 minutes (deposits) or 5 minutes (payouts), GET status and apply
the same transition logic as the callback. Intents pending more than 24 hours raise an alert.

### 7.7 Failure mapping

Map pawaPay `failureCode` to user copy: `INSUFFICIENT_BALANCE`, `PAYMENT_NOT_APPROVED`,
`PAYER_LIMIT_REACHED`, `TRANSACTION_ALREADY_IN_PROCESS`, `RECIPIENT_NOT_FOUND`,
`WALLET_LIMIT_REACHED`, `RECIPIENT_LIMIT_REACHED`, `PROVIDER_TEMPORARILY_UNAVAILABLE`,
`AMOUNT_OUT_OF_BOUNDS`, `INVALID_PHONE_NUMBER`, `UNSPECIFIED_FAILURE`, `UNKNOWN_ERROR` (never
mark failed on this one; check status first).

---

## 8. FX and treasury

### 8.1 Where the rate is used

Only three places, none visible to users: converting an order-book stake to USD, valuing a
cash-out, and treasury conversions of float. Deposits, payouts, and pools never touch it.

### 8.2 Reference rate

- `fx_rate_snapshots` (currency, rate, source, fetched_at). A cron fetches every 10 minutes
  from a rates API (Open Exchange Rates or exchangerate-api; env `FX_RATES_API_KEY`).
- KES floats freely and the API mid-market rate is realistic. Keep an admin **manual override**
  per currency anyway; it is what makes a controlled currency like ETB possible later without
  code.
- Safety rails: feed older than 30 minutes widens the margin by one point; a move above 2% since
  the previous snapshot pauses new order-book quotes in that currency and alerts. Pools are
  unaffected.

### 8.3 Margin and fees

| Item | Default | Where set |
|---|---|---|
| Platform margin on order-book trades | 1.5% (KES) | `settings` per currency |
| Deposit fee | none | n/a |
| Withdrawal fee | flat, e.g. 25 KES | `settings` per currency |
| Pool rake | 4%, optional creator share | `settings`, overridable per community |

The margin must cover pawaPay's per-leg fees (pull the real percentages from the sandbox
dashboard before fixing these), the realised cost of converting float, FX drift while money
sits in float, and profit.

### 8.4 Float management

- The house is **long USDC, short KES** on order-book markets. Shilling weakness helps the
  house; shilling strength hurts it. This is a real exposure and sits on the treasury
  page.
- Target float per currency is roughly 10 to 14 days of expected payouts (`settings`). Below
  target: top up from USD. Above target: convert the excess to USDC on a weekly schedule. A
  net-positive country converts nothing until it crosses target.
- **Exposure cap** per currency: total fixed local payouts outstanding on order-book markets.
  Above the cap, new order-book stakes in that currency are declined with a friendly message
  while pools keep working.
- Realised FX gain or loss is posted to `fx:<CCY>` at every redemption and every treasury
  conversion. Review monthly; adjust margin, not the other way round.

---

## 9. Data model (new)

```
ledger_accounts        id, owner_type (user|house), owner_id, currency, balance, reserved, created_at
ledger_transactions    id, kind, reference_type, reference_id, created_at, metadata
ledger_entries         id, transaction_id, account_id, amount (signed bigint), currency
payment_intents        id, user_id, kind (deposit|payout), provider_ref (UUID sent to pawaPay),
                       provider, msisdn, country, currency, amount, fee, state, failure_code,
                       failure_message, raw_last_status, created_at, updated_at, completed_at
fx_rate_snapshots      id, currency, rate_per_usd, source, fetched_at, is_override
user_orders            id, user_id, market_id, engine, side, local_stake, usd_cents, rate_used,
                       margin_bps, shares_requested, fixed_local_payout, state, created_at
house_orders           id, user_order_id, clob_order_id, maker_amount, taker_amount, state
positions              id, user_id, market_id, outcome, shares, fixed_local_payout, currency
pools                  id, market_id, currency, rake_bps, creator_share_bps, state, closes_at,
                       settled_outcome, settled_at
pool_stakes            id, pool_id, user_id, outcome, amount, payout, created_at
reconciliation_runs    id, ran_at, check, expected, actual, delta, status
```

Changes to existing tables: `communities.tier`, `communities.currency`,
`community_markets.engine`, `markets.engine`, `users.ledger_currency`, `users.msisdn_last`.

Migrations follow the existing plain-SQL convention in `src/lib/db/migrations/` with Drizzle
schema in a new `src/lib/db/schema/payments/` group exported from `schema/index.ts`.

---

## 10. Routes and actions

**Server actions** (`src/app/[locale]/(platform)/_actions/`):
`payments-predict-provider`, `payments-create-deposit`, `payments-create-payout`,
`ledger-place-order` (branches on engine), `ledger-cash-out`, `pool-stake`.

**API routes**: `POST /api/payments/pawapay/callback`; cron routes
`/api/sync/payments-status`, `/api/sync/fx-rates`, `/api/sync/community-tiers`,
`/api/sync/reconcile`, all behind `CRON_SECRET` via `handleCronRoute`.

**Admin API** under `src/app/[locale]/admin/api/`: treasury summary, intents list with
filters, manual rate override, margin, fee and threshold settings, pause switches per currency.

---

## 11. UI changes

- **Wallet modal**: a "Mobile money" entry in `WalletFundMenu` and a `mobile-money` view in
  `WalletFlow` with a deposit/withdraw toggle, modelled on `TonRailPanel`. Steps: phone,
  provider confirm, amount, confirm, waiting, result. Reuse `CountdownBadge`,
  `WalletAmountStep`, `WalletSuccessStep`.
- **Odds**: default `oddsFormat` to `percentage` for ledger users; hide the `price` (cents)
  option for them. `formatOddsFromPrice` already exists in `src/lib/odds-format.ts`.
- **Order panel**: amounts in local currency; "Pays X KES" fixed for order-book markets,
  "Estimated X KES" for pools. Calls `ledger-place-order` instead of client-side signing.
- **Portfolio and activity**: read from `positions`, `user_orders`, `pool_stakes`,
  `payment_intents`, not from Kuest's data API by wallet.
- **Header balance**: ledger balance in local currency.
- **Settings**: ledger currency (locked after first deposit), withdrawal 2FA setup.
- **Admin**: see section 11A. This is a finance back office, not one page.
- **Communities**: tier badge, "what promotion means" copy, pool odds display.

---

## 11A. Admin back office

Under omnibus the operator holds customer money, so admin stops being "configure the site" and
becomes the place where money is watched, corrected, and paused. The existing admin shell
(overview, users, health, sync-jobs, integrations, audit-log, communities, market-making,
notifications) is extended, and four new sections are added.

### New sections

| Section | What it shows | Actions |
|---|---|---|
| **Treasury** | Per enabled currency: pawaPay wallet balance (live), ledger `float:<CCY>`, target, days of payout cover, outstanding fixed payouts vs exposure cap, house USDC on Kuest, realised FX P&L, conversion history | Record a float conversion (KES to USDC, posts the ledger lines and FX result); edit float target, exposure cap, margin, withdrawal fee, pool rake; **pause switches** per currency for deposits, payouts, and order-book trading independently |
| **Payments** | Every `payment_intents` row with filters (kind, state, currency, provider, user, phone, date); detail drawer with raw pawaPay status history and callback log; a "stuck" view for anything pending over 24 h | Re-check status now; ask pawaPay to resend the callback; cancel an enqueued payout; manual mark completed or failed with mandatory reason (audit-logged, and maker-checker for payouts) |
| **Ledger** | Per-user account view: balance, reserved, entries with running total, open positions and pool stakes; house accounts view; search by user, email, or phone | Manual adjustment (credit, refund, goodwill, correction) with mandatory reason and category; freeze or unfreeze an account; CSV export of entries for a period, for accountants and the regulator |
| **Reconciliation** | Nightly run history; each of the five checks with expected, actual, delta, and state; drill-down to the rows that explain a delta | Acknowledge a run with a note; re-run a single check; the pause switch that a failed check tripped is shown here with a one-click resume once resolved |

### Extended sections

- **Overview**: new KPI tiles for deposits and payouts today, net flow, total user balances,
  float vs target, pending intents, open exposure, failed callbacks in 24 h, last reconciliation
  state. These are the numbers an operator checks every morning.
- **Users**: the table already shows Sumsub status and deposit wallet. Add ledger currency,
  balance, reserved, open positions value, masked phone, withdrawal-2FA status, and a
  "ledger user" versus "wallet user" indicator. Row actions: view ledger, freeze (blocks trades
  and payouts, deposits still land), reset withdrawal 2FA, set a per-user limit override.
- **Health**: add checks for pawaPay API reachability and token validity (one active-conf
  call), pawaPay public-key fetch for callback verification, rates feed freshness, house signer
  reachable and its USDC and gas balance, and the age of the last reconciliation run.
- **Sync-jobs**: already generic by `job_type`; the new jobs (payments status poller, FX rates,
  reconcile, community tiers) appear with no code beyond registering them.
- **Integrations**: a pawaPay card with environment (sandbox or production), token test
  connection modelled on the Sumsub test route, the callback URL to paste into the pawaPay
  dashboard, and the signed-callbacks expectation. A rates-API card with key test.
- **Audit log**: new action kinds: manual ledger adjustment, intent override, float conversion,
  rate override, pause toggle, limit change, tier override, finance-settings change. Every one
  carries actor, reason, before and after.
- **Communities**: a Pools tab (open pools with sizes and implied odds, settled pools, cancel
  and refund a pool) and tier controls (current tier, promote or demote with reason, promotion
  history, threshold settings).
- **Market-making**: house market-maker status per promoted market, when that bot exists.
- **Notifications**: super-admin alerts for a pause event, a failed reconciliation check, a
  stuck intent, low float, exposure cap hit, and rates feed stale.
- **Settings**: a Limits and Risk group: daily deposit, payout, and stake caps per KYC tier,
  velocity rules, first-withdrawal hold after a phone change, exposure cap, promotion
  thresholds.

### Roles and dual control

Today admin is a wallet allowlist plus a super-admin flag. Money operations need one more
layer:

- A **finance** capability on top of admin. Only finance can post manual ledger adjustments,
  record float conversions, override intents, or flip pause switches off. Every admin can
  read.
- **Maker-checker** for anything that creates money: a manual credit, a forced payout
  completion, or a conversion above a configurable amount is proposed by one finance user and
  approved by a different one before the ledger lines post. Pending approvals show on the
  Overview.
- Freezing an account is single-person; unfreezing is maker-checker.

### Where this lands in the phases

| Phase | Admin work included |
|---|---|
| 1 | Ledger view (read-only) and CSV export, so every later phase can be inspected |
| 2–3 | Payments console with re-check, resend, and cancel-enqueued; Integrations pawaPay card; Health checks for pawaPay and rates |
| 4 | Treasury page, pause switches, Overview KPIs, finance capability and audit-log kinds |
| 7 | Pools tab in Communities |
| 8 | Reconciliation page, alert wiring, maker-checker for adjustments and conversions |
| 9 | Tier controls and promotion history |
| 10 | Limits and Risk settings, per-user overrides, user freeze and 2FA reset |

Roughly a quarter of the total build is admin. It is not optional: without the Payments
console you cannot test deposits in sandbox beyond happy paths, and without the pause switches
and reconciliation you cannot responsibly hold a shilling of anyone's money.

---

## 11B. Upstream-sync friendliness

Kuest upstream is merged weekly. FORK.md section 2 lists the files that already conflict on
every sync (auth, AppKitProvider, wallet modal, onboarding, runtime config, deps, i18n JSON).
This feature must not widen that list. Rules:

**Additive by default.** Everything new lives in fork-only paths that upstream never touches:
`src/lib/pawapay/`, `src/lib/ledger/`, `src/lib/pools/`, `src/lib/fx/`,
`src/lib/db/schema/payments/`, `src/app/api/payments/`, `src/app/[locale]/admin/treasury/`,
`admin/payments/`, `admin/ledger/`, `admin/reconciliation/`, new server actions with a
`ledger-`, `payments-` or `pool-` prefix, new cron routes under `api/sync/`, new tests. These
merge clean forever, same as Communities and the TON rail do today.

**One-line insertions where upstream files must change.** Where the feature has to appear in
an upstream-owned file, the change is a single import plus a single render or branch that
delegates to a fork-only component or function, never inline logic:

| Upstream file | Insertion | Note |
|---|---|---|
| `wallet-modal/WalletFundMenu.tsx`, `WalletFlow.tsx` | one menu entry + one view case rendering `MobileMoneyPanel` | Already conflict-prone because of the TON rail; the TON graft is the pattern to copy |
| Order panel (`EventOrderPanel*`) | one branch: `if (engine !== 'clob') return <LedgerOrderPanel />` at the top | Keep upstream's panel untouched below the branch |
| Portfolio and activity pages | one data-source switch to a fork hook when the user is a ledger user | Upstream's wallet path stays as the default |
| `src/lib/db/schema/index.ts` | one `export * from './payments/tables'` line | Same as communities, sumsub, waitlist already do |
| Admin sidebar config | new nav entries appended at the end | The admin shell is already fork-owned (FORK.md: take ours) |
| `package.json` | only if a dependency is unavoidable; prefer zero new deps | RFC 9421 verification hand-rolled on `node:crypto` rather than a library |
| `src/i18n/messages/*.json` | new hashed keys only | Union-merged every sync already; never edit existing keys |

**Never touch** for this feature: `src/lib/auth.ts`, `AppKitProvider.tsx`, `network.ts`,
`public-runtime-config*.ts`, `TradingOnboardingProvider.tsx`, `store-order.ts`,
`src/lib/orders/*`, `src/lib/clob*.ts`, upstream migrations. The house-signing path **calls**
`buildOrderPayload` and the CLOB submit helpers from a fork-only module; it does not modify
them. If upstream changes the order payload, the fork module gets the change for free.

**Feature flag.** A `payments.enabled` setting (and per-currency enabled flags) gates every
insertion point. With the flag off the app renders exactly the upstream path, so a sync can be
verified against known behaviour before the rail is switched back on.

**Housekeeping on every phase.**
- Add each new fork-only path to FORK.md section 1 and each insertion to section 2, with the
  resolution policy ("keep ours, re-apply upstream's hunks below the branch").
- Register parked exports in `knip.config.ts` rather than deleting them, as the rhino client
  does, so the pre-commit hook does not force churn in upstream files.
- Tests go in the fork's test tree with the current runner (the suite moved to `bun test`
  during the Oct syncs even though CLAUDE.md still says vitest); never edit upstream test files.
- Migrations are new files only, never edits to existing SQL.

Done this way the weekly sync gains at most three predictable hunks (wallet menu, order panel
branch, portfolio switch), all with a one-line "keep ours" policy.

---

## 12. Reconciliation and operations

Nightly `/api/sync/reconcile`, results in `reconciliation_runs`, any failure pauses trading in
the affected currency and pages:

1. Sum of `ledger_entries` per account = cached `balance` + `reserved`.
2. Sum of user `positions.shares` per market = house position on Kuest for that market.
3. Sum of user balances + reservations per currency = `float:<CCY>` (compare with pawaPay
   wallet balance endpoint) + house USDC valued at the day's reference rate, adjusted by
   `fx:<CCY>`.
4. Every `payment_intents` row pending more than 24 h listed.
5. Every pool: sum of stakes = pool balance; settled pools: payouts + rake + rounding = stakes.

Alerts via the existing notifications plumbing to super admins; Sentry for exceptions.

---

## 13. Security and compliance

- pawaPay token and house signer key are server-only env vars; never in client bundles.
- Signed callbacks verified (7.5); replay-safe by design; idempotent intents.
- Withdrawals: second factor, daily limits, velocity checks, and a hold on first withdrawal
  after a phone number change.
- KYC: the fork already carries a Sumsub schema (`src/lib/db/schema/sumsub`). Tier limits by
  KYC status: low daily caps unverified, higher once verified.
- Geoblocking already exists; gate the mobile-money panel to supported countries.
- Legal position: under omnibus Prophit holds customer funds. Kenya: Gambling Regulatory
  Authority licence and segregated client account before real money. Ethiopia: sandbox only
  until licences reopen. pawaPay must approve a prediction-market merchant per country; ask
  before going live and confirm settlement currency (local bank vs USD).
- Audit: `ledger_entries` are append-only; admin overrides (rates, manual credits) write to
  the existing admin audit log.

---

## 14. Build phases (sandbox first)

Each phase ends green on `npm run build`, `npx tsc --noEmit`, `npm run test:unit`, knip.

| # | Phase | Done when |
|---|---|---|
| 0 | Branch and plumbing | Branch on `custom-production` (done). Env vars, `pawapay` client with active-conf and predict-provider, unit tests against recorded fixtures. |
| 1 | Ledger core | Schema and migrations, `Ledger` service (post transaction, reserve, release, derive balance), property tests that entries always sum to zero. |
| 2 | Deposits (sandbox) | Deposit action, callback route with signature verification, status poller, wallet-modal deposit view. KES test numbers produce the documented outcomes end to end; balance shows in the header. |
| 3 | Payouts (sandbox) | Payout action with fee and 2FA, enqueued and failed handling, withdraw view. Reservation released on failure; fee booked. |
| 4 | FX and treasury base | Rate cron with snapshots, admin override, safety rails, `settings` for margin, fees, targets, treasury page v1 (read-only). |
| 5 | Order-book trading via house account | House signer, `ledger-place-order`, house fill attribution, fixed local payouts, cash-out, portfolio from ledger. Verified on Amoy with the existing deployed house wallet. |
| 6 | Redemption and resolution credits | House redeems once per resolved market; winners credited; FX posted. |
| 7 | Community pools | Pool engine, stake, jury-threshold settlement, rake, pool odds UI; deploy hook swapped for `engine = pool`. |
| 8 | Reconciliation and alerts | All five checks, pause switches, super-admin alerts. |
| 9 | Tiering | Nightly tier job, overrides, new-markets-only semantics, badge and copy. On-chain push of jury verdicts via direct resolution (prerequisite for any promotion). |
| 10 | Hardening | Limits, KYC tiers, IP allowlist, runbooks, load test of callback route. |

Phases 1 to 4 and 7 do not depend on Kuest at all and can proceed while the relayer question
stays open. Phase 5 needs the house account's deployed wallet (exists on Amoy).

**Adding a second currency later** (ETB, UGX, TZS, GHS) is a checklist, not a phase: add the
`settings` row (enabled, margin, withdrawal fee, float target, exposure cap, rate override),
confirm the provider in pawaPay's active configuration, run the sandbox test numbers for that
provider, fund the float. The only code that could be touched is the rate-source adapter if the
currency is not on the rates API.

---

## 15. Open questions and dependencies

1. **pawaPay fees** per provider and leg: read from the sandbox dashboard, then fix margins.
2. **pawaPay settlement**: Kenyan bank account in KES, or USD? Decides who does the KES to USDC
   conversion and how big the float buffer must be.
3. **pawaPay merchant approval** for a prediction-market business in Kenya.
4. **Kuest terms**: one operator account trading for many end users; builder-code fee
   attribution with a single maker address.
5. **Rates API choice** and whether a paid tier is needed for 10-minute refresh.
6. **Pool cash-out before close**: deferred; revisit after launch.
7. **Creator share of rake**: on by default or per community?
8. **House market-making** for promoted markets: own bot vs sponsored campaigns (needs the
   upstream sync).
9. **Relayer blocker** remains for anything that needs new on-chain wallets; omnibus avoids
   it for users but the house wallet must stay deployed when moving to mainnet.

---

## 16. Risks

- **FX**: fixed local payouts with USD assets. Bounded by margin, exposure caps, float targets,
  and the pause rail. Reviewed monthly.
- **Custody**: a bug in the ledger or a compromised key is a loss of user money. Append-only
  entries, nightly reconciliation, 2FA withdrawals, limits.
- **Callback integrity**: unsigned callbacks would let anyone credit balances. Signed callbacks
  are mandatory before any real money.
- **Regulatory**: operating without a Gambling Regulatory Authority licence in Kenya is not an
  option; sandbox and free-to-play only until then.
- **Thin promoted markets**: promotion without market-making produces a bad first impression.
  Tie promotion to a market-making budget.
- **Single provider**: Kenya on pawaPay is M-Pesa only, which is most of the market but not
  Airtel Money. Acceptable for launch; revisit if Airtel users show up in support.
- **Ethiopia later**: when licences reopen, birr adds forex-control and repatriation risk on top
  of this design (closed-loop float, pools preferred). Decide then, not now.
