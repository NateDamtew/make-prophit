# Local Payments — implementation log

Companion to `LOCAL-PAYMENTS-DESIGN.md`. Autonomous build run started 2026-10-20 (evening).
Each phase ends with tests and a local commit on `claude/local-payments-birr-270802`.
Nothing is pushed or deployed.

## Decisions made during the build (one line each)

| # | Decision | Why |
|---|---|---|
| D1 | Migrations are applied to the **dev** Supabase project only (prophit-payments-dev); never to beta | Dev project exists for exactly this; beta applies them itself on the next deploy via `db:push` |
| D2 | pawaPay API token lives in env (`PAWAPAY_API_TOKEN`), not in the settings table | Secrets stay out of the DB; matches how Kuest/rhino keys are handled |
| D3 | Non-secret rail config (enabled, currencies, margins, fees, limits) lives in `settings` group `mobile_money` | Admin-editable without deploys; same pattern as Sumsub/affiliate settings |
| D4 | Module namespaces are `src/lib/pawapay`, `src/lib/ledger`, `src/lib/mobile-money`; API route under `/api/mobile-money/` | `src/lib/payments` and `/api/payments` already belong to upstream's Meld on/off-ramp |
| D5 | Unsigned pawaPay callbacks are rejected unless `PAWAPAY_ALLOW_UNSIGNED_CALLBACKS=true` | Safe by default; the flag exists only for sandbox before signed callbacks are switched on |
| D6 | RFC 9421 verification is hand-rolled on `node:crypto`, zero new dependencies | Keeps `package.json` free of fork-only deps that conflict on every upstream sync |
| D7 | The ledger stores two decimals for every currency; provider rounding happens only at the pawaPay edge | One representation everywhere; KES deposits need whole shillings but payouts allow cents |
| D8 | Failure-code copy is plain English server-side (like `trading-flow-errors.ts`), not i18n keys | Customer-facing and stable; translation can wrap it later |

## Phase status

| Phase | Status | Commit |
|---|---|---|
| 0 | pawaPay client, amounts, signature verification, failure codes, settings, tests | in progress |

## Your checklist (filled in as phases complete)

See the final summary message; this section is regenerated at the end of the run.
