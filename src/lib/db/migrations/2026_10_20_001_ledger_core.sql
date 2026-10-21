-- Local-currency ledger + mobile-money payment intents (fork-only).
-- See LOCAL-PAYMENTS-DESIGN.md §4 (money model) and §9 (data model).
--
-- Conventions: integer minor units, two decimals for every currency; every
-- account has a normal balance (debit = assets/expenses, credit = liabilities/
-- revenue); each transaction's debits equal its credits per currency.

-- ─── User ledger profile ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_user_profiles (
  user_id            CHAR(26) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  currency           CHAR(3) NOT NULL,
  country            CHAR(3),
  withdrawals_frozen BOOLEAN NOT NULL DEFAULT FALSE,
  trading_frozen     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Accounts ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id             CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  owner_type     TEXT NOT NULL,
  owner_id       TEXT,
  kind           TEXT NOT NULL,
  currency       CHAR(3) NOT NULL,
  normal_balance TEXT NOT NULL,
  balance        BIGINT NOT NULL DEFAULT 0,
  reserved       BIGINT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ledger_accounts_owner_type CHECK (owner_type IN ('user', 'house')),
  CONSTRAINT chk_ledger_accounts_kind CHECK (
    kind IN ('user_cash', 'float', 'fees', 'rounding', 'pool_rake', 'pool', 'fx', 'fx_clearing', 'settlement', 'suspense')
  ),
  CONSTRAINT chk_ledger_accounts_normal_balance CHECK (normal_balance IN ('debit', 'credit')),
  CONSTRAINT chk_ledger_accounts_reserved CHECK (reserved >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_accounts_owner_kind_currency
  ON ledger_accounts (owner_type, COALESCE(owner_id, ''), kind, currency);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_owner ON ledger_accounts (owner_type, owner_id);

CREATE OR REPLACE TRIGGER set_ledger_accounts_updated_at
  BEFORE UPDATE ON ledger_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Transactions + entries (append-only) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_transactions (
  id                 CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  kind               TEXT NOT NULL,
  reference_type     TEXT,
  reference_id       TEXT,
  idempotency_key    TEXT,
  description        TEXT,
  metadata           JSONB,
  created_by_user_id CHAR(26),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_transactions_idempotency ON ledger_transactions (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_reference ON ledger_transactions (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_created_at ON ledger_transactions (created_at);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id             CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  transaction_id CHAR(26) NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  account_id     CHAR(26) NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  side           TEXT NOT NULL,
  amount         BIGINT NOT NULL,
  currency       CHAR(3) NOT NULL,
  balance_after  BIGINT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ledger_entries_side CHECK (side IN ('debit', 'credit')),
  CONSTRAINT chk_ledger_entries_amount CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_created ON ledger_entries (account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction ON ledger_entries (transaction_id);

-- Entries are immutable: block UPDATE/DELETE at the database level.
CREATE OR REPLACE FUNCTION public.ledger_entries_immutable() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries are append-only';
END;
$$;

DROP TRIGGER IF EXISTS ledger_entries_no_update ON ledger_entries;
CREATE TRIGGER ledger_entries_no_update
  BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION public.ledger_entries_immutable();

-- ─── Reservations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_reservations (
  id             CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  account_id     CHAR(26) NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  amount         BIGINT NOT NULL,
  currency       CHAR(3) NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id   TEXT NOT NULL,
  state          TEXT NOT NULL DEFAULT 'active',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at     TIMESTAMPTZ,
  CONSTRAINT chk_ledger_reservations_amount CHECK (amount > 0),
  CONSTRAINT chk_ledger_reservations_state CHECK (state IN ('active', 'consumed', 'released'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_reservations_reference ON ledger_reservations (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_ledger_reservations_account_state ON ledger_reservations (account_id, state);

-- ─── Saved mobile-money numbers ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mobile_money_accounts (
  id           CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  user_id      CHAR(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  msisdn       TEXT NOT NULL,
  provider     TEXT NOT NULL,
  country      CHAR(3) NOT NULL,
  currency     CHAR(3) NOT NULL,
  verified_at  TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_money_accounts_user_msisdn ON mobile_money_accounts (user_id, msisdn, provider);
CREATE INDEX IF NOT EXISTS idx_mobile_money_accounts_user ON mobile_money_accounts (user_id);

-- ─── Payment intents (one row per pawaPay deposit / payout) ──────────────────
CREATE TABLE IF NOT EXISTS payment_intents (
  id                      CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  user_id                 CHAR(26) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind                    TEXT NOT NULL,
  provider_ref            UUID NOT NULL,
  provider                TEXT NOT NULL,
  msisdn                  TEXT NOT NULL,
  country                 CHAR(3) NOT NULL,
  currency                CHAR(3) NOT NULL,
  amount                  BIGINT NOT NULL,
  fee                     BIGINT NOT NULL DEFAULT 0,
  net_amount              BIGINT NOT NULL,
  state                   TEXT NOT NULL,
  provider_status         TEXT,
  failure_code            TEXT,
  failure_message         TEXT,
  provider_transaction_id TEXT,
  customer_message        TEXT,
  reservation_id          CHAR(26) REFERENCES ledger_reservations(id) ON DELETE SET NULL,
  ledger_transaction_id   CHAR(26) REFERENCES ledger_transactions(id) ON DELETE SET NULL,
  callback_count          INTEGER NOT NULL DEFAULT 0,
  status_check_count      INTEGER NOT NULL DEFAULT 0,
  last_status_check_at    TIMESTAMPTZ,
  last_raw_status         JSONB,
  completed_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_payment_intents_kind CHECK (kind IN ('deposit', 'payout')),
  CONSTRAINT chk_payment_intents_state CHECK (
    state IN ('initiated', 'pending', 'completed', 'failed', 'rejected', 'cancelled')
  ),
  CONSTRAINT chk_payment_intents_amount CHECK (amount > 0 AND fee >= 0 AND net_amount > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_provider_ref ON payment_intents (provider_ref);
CREATE INDEX IF NOT EXISTS idx_payment_intents_user_created ON payment_intents (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payment_intents_state_created ON payment_intents (state, created_at);
CREATE INDEX IF NOT EXISTS idx_payment_intents_kind_state ON payment_intents (kind, state);

CREATE OR REPLACE TRIGGER set_payment_intents_updated_at
  BEFORE UPDATE ON payment_intents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Callback audit (idempotency by body fingerprint) ────────────────────────
CREATE TABLE IF NOT EXISTS payment_callback_events (
  fingerprint        TEXT PRIMARY KEY,
  intent_id          CHAR(26) REFERENCES payment_intents(id) ON DELETE SET NULL,
  provider_ref       UUID,
  kind               TEXT,
  status             TEXT,
  signature_key_id   TEXT,
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  payload            JSONB,
  received_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_callback_events_intent ON payment_callback_events (intent_id);

-- ─── FX reference-rate snapshots ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fx_rate_snapshots (
  id           CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  currency     CHAR(3) NOT NULL,
  rate_per_usd NUMERIC(18, 6) NOT NULL,
  source       TEXT NOT NULL,
  is_override  BOOLEAN NOT NULL DEFAULT FALSE,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_fx_rate_snapshots_rate CHECK (rate_per_usd > 0)
);

CREATE INDEX IF NOT EXISTS idx_fx_rate_snapshots_currency_fetched ON fx_rate_snapshots (currency, fetched_at);

-- ─── Row level security (upstream convention: service_role policy only) ──────
ALTER TABLE public.ledger_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_money_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_callback_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_rate_snapshots ENABLE ROW LEVEL SECURITY;

-- service_role policies (idempotent)
DO $migration$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'ledger_user_profiles', 'ledger_accounts', 'ledger_transactions', 'ledger_entries',
    'ledger_reservations', 'mobile_money_accounts', 'payment_intents', 'payment_callback_events',
    'fx_rate_snapshots'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = 'service_role_all_' || tbl
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I TO service_role USING (true) WITH CHECK (true)',
        'service_role_all_' || tbl, tbl
      );
    END IF;
  END LOOP;
END
$migration$;
