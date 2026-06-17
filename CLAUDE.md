# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Kuest/Prophit is an open-source prediction market platform built on Polygon. White-label infrastructure sharing liquidity with Polymarket. Next.js 16 + React 19 + TypeScript 5.9 + Tailwind CSS 4.

## Commands

```bash
npm run dev          # Dev server (Turbo)
npm run build        # Production build
npm run lint         # ESLint with auto-fix
npm run test:unit    # Vitest unit tests (jsdom)
npm run test:e2e     # Playwright E2E tests
npm run db:push      # Apply Drizzle schema to Postgres
npm run knip         # Detect unused exports/dependencies
```

Vercel build command: `npm run db:push && next build`

Run a single test: `npx vitest run tests/unit/MyTest.test.ts`

## Architecture

### Routing

Next.js App Router with `next-intl` i18n. All user-facing routes live under `src/app/[locale]/`. Supported locales: en (default), de, es, pt, fr, zh.

- `(platform)/` — Main user-facing app (route group, no URL segment). Contains `_actions/`, `_components/`, `_providers/`, `_lib/`.
- `admin/` — Admin dashboard for market creation, user management.
- `auth/` — Auth pages (2FA).
- `docs/` — Fumadocs MDX documentation.
- `api/` — API routes at `src/app/api/` (outside `[locale]`).

**`cacheComponents` is enabled** in `next.config.ts`. This means:
- `generateStaticParams` must return at least one result (empty arrays cause build errors).
- `export const dynamic = 'force-dynamic'` is incompatible — use `next/dynamic` with `ssr: false` instead.
- Route groups under `[locale]` inherit the root layout's `generateStaticParams([{locale:'en'}])`.

### Authentication

`better-auth` with SIWE (Sign-In-With-Ethereum) plugin remains the session authority. Wallet connection + embedded wallets are provided by **Dynamic.xyz** (`@dynamic-labs/*`); wagmi is bridged via `DynamicWagmiConnector`. Users authenticate by connecting a wallet (external or a Dynamic embedded wallet for email/social login) and signing a SIWE message. Session cookies are `better-auth.session_token` (dev) / `__Secure-better-auth.session_token` (prod). `NEXT_PUBLIC_DYNAMIC_ENV_ID` selects the Dynamic environment; production domains must be allowlisted in the Dynamic dashboard CORS settings.

Telegram Mini App auth uses a custom plugin at `/api/auth/telegram/verify-tma` that validates `initData` via HMAC and creates sessions.

When adding trusted domains (e.g., subdomains), add them to `trustedOrigins` in `src/lib/auth.ts`.

**SIWE sign-in rules — do not break these:**
- `verifyMessage` in `src/lib/auth.ts` uses **pure ECDSA** (`viemVerifyMessage`) as the primary path. Do NOT replace this with WalletConnect RPC as the primary — WalletConnect RPC requires domain allowlisting in WalletConnect Cloud and breaks in production. The RPC is only kept as a fallback for smart contract wallets (EIP-1271); it still reads `REOWN_APPKIT_PROJECT_ID`.
- `driveSIWEHandshake` in `src/providers/AppKitProvider.tsx` reads the wallet's **actual connected chainId** (`getConnectedAccount`) for both nonce and verify. Do NOT hardcode `defaultNetwork.id` — forcing a chain switch before sign-in breaks Metamask, Binance Wallet, and any wallet not already on Polygon. Chain restriction is for trading, not authentication.
- SIWE is signed with `primaryWallet.signMessage()` (Dynamic Wallet), NOT the wagmi `signMessage` action — embedded/social wallets aren't in wagmi yet at `onAuthSuccess`.
- `AppKitProvider` mounts `DynamicContextProvider` **client-only** (gated on `useHasHydrated`) because `cacheComponents` streaming hydration crashes Dynamic's internal widgets. All consumers read our own `AppKitContext` (via `AppKitBridge`) — never call Dynamic hooks directly in app code.
- Logout must clear **both** layers: Dynamic `handleLogOut` + better-auth `signOutAndRedirect`. Dynamic logout alone leaves the better-auth session alive.

### Database

Drizzle ORM with PostgreSQL (Supabase). Schema at `src/lib/db/schema/`:
- `auth/` — users, sessions, accounts, wallets, two_factors, verifications
- `events/` — conditions, markets, outcomes, tags, event_tags, sports tables
- `orders/` — CLOB orders with on-chain settlement data
- `affiliates/` — affiliate referrals and fee tracking
- `bookmarks/`, `notifications/`, `settings/`, `subgraph/`

`users.address` is nullable — Telegram users have `null` until they connect a wallet. Always check `user.address` before assuming a wallet exists.

Custom columns not known to `better-auth` (like `address`, `username`) must be set via direct Drizzle queries after `internalAdapter.createUser()`.

### Trading Flow

1. User connects wallet → SIWE auth → session created
2. Deposit wallet created via relayer (`/submit` endpoint with HMAC auth)
3. Token approvals signed
4. Orders placed via CLOB, settled on-chain on Polygon

Platform operator keys (`KUEST_API_KEY`, `KUEST_API_SECRET`, `KUEST_PASSPHRASE`, `KUEST_ADDRESS`) authenticate with the relayer. The `from` field in relayer requests must match `KUEST_ADDRESS` when using platform keys.

### Providers & State

- `AppKitProvider` — Dynamic.xyz (`DynamicContextProvider` + `DynamicWagmiConnector`) + wagmi + SIWE. Mounted client-only after hydration; exposes a stable `AppKitContext` so consumers don't touch Dynamic hooks. (Name kept from the old Reown provider to avoid churn across ~30 call sites.)
- `TradingOnboardingProvider` — Multi-step onboarding (username → email → enable trading → approve tokens → auto-redeem).
- `AppProviders` — React Query + Zustand + Theme.
- `SiteIdentityProvider` — White-label branding context.

Onboarding modals are gated by `hasValidWalletAddress` — users with `null` address skip all trading onboarding.

### TMA (Telegram Mini App)

Same app, same routes. Detection via `window.Telegram?.WebApp` or `tma.*` hostname. `TmaAutoLogin` component in platform layout handles:
- Inside Telegram with `initData` → auto-auth silently
- Inside Telegram without `initData` → browse normally
- On `tma.*` in browser → Telegram login screen

The Telegram WebApp script is loaded in the root locale layout via `next/script`.

## Key Conventions

- **Private dirs**: `_components/`, `_actions/`, `_providers/`, `_lib/`, `_hooks/`, `_utils/` — not exposed as routes.
- **Server actions**: `'use server'` files in `_actions/`. All exported functions become async automatically.
- **i18n**: Use `useExtracted()` (not `useTranslations`) for translation strings. Message keys are hashed IDs (e.g., `"dIgBOz": "Deposit"`).
- **Imports**: Use `@/` path alias. Imports are auto-sorted by the linter.
- **Styling**: Tailwind CSS with `@antfu/eslint-config` enforcing class ordering. Wrap at 120px.
- **Error mapping**: Trading flow errors go through `src/lib/trading-flow-errors.ts` which maps raw relayer errors to user-friendly messages.
- **Knip**: Pre-commit hook runs knip to detect unused exports. Unused exports will fail the commit.
- **ESLint**: Pre-commit hook runs eslint with auto-fix on staged files. The linter may modify files (e.g., adding `async` to `'use server'` exports, reordering imports).

## Environment

Key env vars: `POSTGRES_URL`, `BETTER_AUTH_SECRET`, `REOWN_APPKIT_PROJECT_ID`, `TELEGRAM_BOT_TOKEN`, `RELAYER_URL`, `CLOB_URL`, `KUEST_API_KEY`, `KUEST_API_SECRET`, `KUEST_PASSPHRASE`, `KUEST_ADDRESS`, `SITE_URL`.

`vercel.json` controls build command and deployment settings. The `custom-production` branch deploys to production.
