# FORK.md — What this fork changes vs. upstream Kuest

This repo (**Prophit / make-prophit**) is a fork of **kuestcom/prediction-market**
(remote `upstream`, default branch `main`). It keeps upstream's trading core and
adds its own auth stack, rails, and features on top.

This document exists so that future upstream syncs know **where our changes live**
and **where merge conflicts will recur**.

> Rule of thumb: **Auth (the Dynamic migration) is the one pervasive overlap** with
> upstream — it ripples into every wallet-touching file. Everything else we built
> (Communities, TON rail, most of TMA) is **additive** and rarely conflicts.

---

## 1. Fork-only additions (net-new — sit ON TOP, ~never conflict)

These are new files/directories upstream doesn't have. Merges leave them untouched.

- **Communities** — full feature: community-created markets, jury voting, invites,
  reviews. ~100 files under `src/app/[locale]/(platform)/community/**`,
  `src/lib/db/queries/community.ts`, `community-*` actions, `community-visibility.ts`.
  (Upstream only has hooks to an *external* community-profile service:
  `community-auth.ts`, `community-profile.ts`, `community-url.ts`.)
- **TON deposit rail** (TMA-gated) — `src/lib/rhino/**` (rhino.fi bridge),
  `wallet-modal/TonRailPanel.tsx`. Fund the DepositWallet from a TON wallet.
- **Telegram Mini App (TMA) auth** — `src/app/[locale]/(platform)/_components/TmaAutoLogin.tsx`,
  `src/lib/tma/**`, the `verify-tma` HMAC auth plugin/route, email-OTP →
  embedded-wallet onboarding wizard.
  **⛔ SHELVED (2026-07-02):** no further TMA work happens in this repo. The
  Telegram Mini App will be a separate native project consuming this app's
  APIs. The in-repo TMA code stays dormant (gated on `isTma`/Telegram detection,
  inert on web) — keep it merging cleanly but don't build on it. The TON rail
  is TMA-gated, so it is dormant too (candidate for reuse by the new project).
- **Dynamic compatibility shims** — `src/hooks/useAppKitAccount.ts`,
  `src/hooks/useAppKitCompat.ts`, `src/hooks/useAppKit.ts` (stable context so
  consumers never call Dynamic hooks directly).

## 2. Modifications to upstream files (THE OVERLAP — conflict-prone on every sync)

Most of these trace back to the **Reown → Dynamic** auth migration.

| Area | Files | Why it conflicts | Resolution policy |
|---|---|---|---|
| **Auth / SIWE** | `src/lib/auth.ts` | Pure-ECDSA-first verify + local `getChainIdFromMessage` (no `@reown/appkit-siwe`) | Keep OURS; re-apply upstream's non-SIWE hunks by hand |
| **Wallet provider** | `src/providers/AppKitProvider.tsx` | Full Dynamic rewrite (upstream is Reown) | Take OURS entirely |
| **Deps** | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | `@dynamic-labs/*` vs upstream `@reown/*` | Drop reown, keep upstream's non-wallet bumps, regenerate lock |
| **Dynamic import shims** | product files (e.g. `DirectResolutionButton`, `AdminCreateEventForm`, `PredictionResultsClient`, `WalletSendForm`) | We import `@/hooks/useAppKitAccount` where upstream imports `@reown/appkit/react` | Keep our shim import; take upstream's other changes |
| **Runtime config** | `usePublicRuntimeConfig.ts`, `public-runtime-config.shared.ts`, `network.ts` | We add `dynamicEnvId`; adopted upstream's `resolvePublicRuntimeEnv` | Take upstream's module, graft `dynamicEnvId` back |
| **Root layout** | `src/app/[locale]/layout.tsx` | We inject the Telegram WebApp `<Script>` | Union — keep both our script + upstream's |
| **Onboarding** | `TradingOnboardingProvider.tsx` | Our "deposit wallet stalled deploying" escape-hatch | Keep our escape-hatch; adopt upstream message/helpers |
| **Wallet modal** | `WalletModal.tsx`, `WalletFlow.tsx`, `wallet-modal/utils.ts`, `WalletSendForm.tsx` | TON rail integration + retained `pendingWithdrawals` (upstream removed it) | Keep our versions; re-weave upstream additions (e.g. wallet reconnect) |
| **SDK page** | `settings/sdks/page.tsx` | We deliberately stripped SDK API-keys + downloads (white-label) | Take OURS |
| **i18n** | `src/i18n/messages/*.json` | Our branding + custom hashed keys | Union-merge (keep all fork keys, append upstream's) |

## 3. Inherited from upstream (NOT ours — sync, don't rebuild)

Trading core (CLOB orders), market resolution (UMA + direct-resolution oracle),
DepositWallet relayer + on-chain contracts, affiliates & fees, admin market
creation (single + neg-risk), sports/esports, the external community-profile
service, i18n framework, and all the language packs.

Contract addresses (`src/lib/contracts.ts`) come from upstream — as of the last
sync they **match upstream/main** (exchange, `CTF_AUTO_REDEEM`, neg-risk adapter).

## 4. How to sync upstream (the proven approach)

1. `git fetch upstream`
2. Branch off `custom-production`, `git merge upstream/main --no-commit`
3. Expect conflicts **only** in the Section 2 files — resolve per the policy above.
4. After resolving: `pnpm install --lockfile-only` (deps changed) → `pnpm install`
   → `npx tsc --noEmit` → `npx vitest run`.
5. Watch for **silently dropped fork code** where upstream heavily rewrote a file
   we also changed (tsc catches type breaks, not consistent feature removals —
   e.g. `pendingWithdrawals` had to be re-woven manually).
6. Merge commit typically bypasses the knip pre-commit hook (`HUSKY=0`) — the
   fork carries some parked knip debt (`rhino` exports, orphaned upstream SDK
   component).

## 5. Config / env that must be set (fork-specific)

- `NEXT_PUBLIC_DYNAMIC_ENV_ID` — Dynamic environment (auth won't work without it).
- `NEXT_PUBLIC_NETWORK_KEY` + `CHAIN_ID` — network selection. The wagmi/Dynamic
  network key (`DEFAULT_NETWORK_KEY` in `src/lib/network.ts`) resolves from
  `NEXT_PUBLIC_NETWORK_KEY` at **build time** (inlined by Next — race-free on
  the client). Do NOT re-adopt upstream's runtime `window.__PUBLIC_RUNTIME_CONFIG__`
  resolution: it raced at module-load and broke wallet sign-in. Defaults to
  Polygon mainnet. **While Kuest's shared relayer/CLOB runs pre-mainnet on
  Amoy**, set `NEXT_PUBLIC_NETWORK_KEY=amoy` + `CHAIN_ID=80002` to match
  (otherwise the relayer rejects approvals with `target_not_allowed` for the
  mainnet USDC address); remove both at mainnet launch (→ 137).
- `TMA_DOMAIN` — Telegram Mini App host (better-auth trustedOrigins).
- `REOWN_APPKIT_PROJECT_ID` — still read as the SIWE smart-contract-wallet RPC
  fallback (see `src/lib/auth.ts`).

## 6. Mainnet launch runbook (the Amoy → Polygon flip)

Do these IN ORDER when Kuest announces mainnet:

1. **Sync upstream first.** Kuest ships final contract addresses right before
   mainnet ("single new exchange contract"). Merge upstream (Section 4) so
   `src/lib/contracts.ts` matches their deployed state — a stale exchange or
   auto-redeem address means the relayer rejects everything.
2. **Dynamic: Sandbox → Live.** Create/configure the Live environment
   (embedded wallets + create-on-signup, social providers, EVM network =
   Polygon only), allowlist the production domains in its CORS settings, and
   set the new `NEXT_PUBLIC_DYNAMIC_ENV_ID` in Vercel. Sandbox users/wallets do
   NOT carry over.
3. **Vercel env:** `NEXT_PUBLIC_NETWORK_KEY` → `polygon` (or remove),
   `CHAIN_ID` → `137`.
4. **Dynamic dashboard networks:** Polygon ON, Amoy OFF (reverse of test phase).
5. **Redeploy** — `NEXT_PUBLIC_*` values are inlined at build time; env changes
   without a rebuild do nothing.
6. **Reset test-phase user state.** Deposit wallets in the DB were deployed on
   Amoy and do not exist on mainnet; approvals/balances are test-only. Wipe
   test accounts or null `deposit_wallet_address`/`deposit_wallet_status` +
   `settings.tradingAuth` so mainnet users onboard fresh.
7. **Rotate secrets that were exposed during testing** (Telegram bot token).
8. **Smoke test with real money, small:** MetaMask sign-in AND email sign-in →
   deposit ~$5 USDC → one trade → one withdrawal. Only then announce.

See `CLAUDE.md` for the deeper architecture notes and the hard rules (esp. the
SIWE sign-in rules and the Dynamic client-only mount).
