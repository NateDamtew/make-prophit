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
- `CHAIN_ID` — e.g. `137` for Polygon. Upstream's configurable-chain change
  **defaults to Amoy testnet** if unset.
- `TMA_DOMAIN` — Telegram Mini App host (better-auth trustedOrigins).
- `REOWN_APPKIT_PROJECT_ID` — still read as the SIWE smart-contract-wallet RPC
  fallback (see `src/lib/auth.ts`).

See `CLAUDE.md` for the deeper architecture notes and the hard rules (esp. the
SIWE sign-in rules and the Dynamic client-only mount).
