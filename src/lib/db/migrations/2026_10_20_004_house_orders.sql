-- House-signed order-book trading on Kuest for ledger users (design §5, §6.1).
-- Users stake local currency; the house places the USD order and holds the
-- shares; each user order maps 1:1 to a house order and carries a fixed local
-- payout decided at order time.

CREATE TABLE IF NOT EXISTS user_orders (
  id                   CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  user_id              CHAR(26) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  condition_id         TEXT NOT NULL,
  market_slug          TEXT,
  token_id             TEXT NOT NULL,
  outcome_index        SMALLINT NOT NULL,
  side                 TEXT NOT NULL,
  currency             CHAR(3) NOT NULL,
  local_stake          BIGINT NOT NULL,
  usd_cents            BIGINT NOT NULL,
  rate_per_usd         NUMERIC(18, 6) NOT NULL,
  margin_bps           INTEGER NOT NULL,
  price_cents          INTEGER NOT NULL,
  shares_micro         BIGINT NOT NULL,
  fixed_local_payout   BIGINT NOT NULL,
  state                TEXT NOT NULL DEFAULT 'pending',
  failure_message      TEXT,
  reservation_id       CHAR(26) REFERENCES ledger_reservations(id) ON DELETE SET NULL,
  ledger_transaction_id CHAR(26) REFERENCES ledger_transactions(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_user_orders_side CHECK (side IN ('buy', 'sell')),
  CONSTRAINT chk_user_orders_state CHECK (state IN ('pending', 'filled', 'rejected', 'failed', 'cancelled')),
  CONSTRAINT chk_user_orders_amounts CHECK (local_stake > 0 AND usd_cents >= 0 AND shares_micro >= 0 AND price_cents BETWEEN 1 AND 99)
);

CREATE INDEX IF NOT EXISTS idx_user_orders_user_created ON user_orders (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_orders_condition ON user_orders (condition_id, state);

CREATE OR REPLACE TRIGGER set_user_orders_updated_at
  BEFORE UPDATE ON user_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS house_orders (
  id             CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  user_order_id  CHAR(26) NOT NULL UNIQUE REFERENCES user_orders(id) ON DELETE RESTRICT,
  clob_order_id  TEXT,
  maker          TEXT NOT NULL,
  token_id       TEXT NOT NULL,
  side           SMALLINT NOT NULL,
  maker_amount   BIGINT NOT NULL,
  taker_amount   BIGINT NOT NULL,
  order_type     TEXT NOT NULL,
  state          TEXT NOT NULL DEFAULT 'submitted',
  clob_response  JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_house_orders_state CHECK (state IN ('submitted', 'filled', 'rejected', 'failed'))
);

CREATE OR REPLACE TRIGGER set_house_orders_updated_at
  BEFORE UPDATE ON house_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS positions (
  id                 CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  user_id            CHAR(26) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  condition_id       TEXT NOT NULL,
  token_id           TEXT NOT NULL,
  outcome_index      SMALLINT NOT NULL,
  currency           CHAR(3) NOT NULL,
  shares_micro       BIGINT NOT NULL DEFAULT 0,
  local_stake        BIGINT NOT NULL DEFAULT 0,
  fixed_local_payout BIGINT NOT NULL DEFAULT 0,
  settled_payout     BIGINT,
  settled_at         TIMESTAMPTZ,
  settlement_tx_id   CHAR(26) REFERENCES ledger_transactions(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT positions_user_token_key UNIQUE (user_id, token_id)
);

CREATE INDEX IF NOT EXISTS idx_positions_condition ON positions (condition_id);
CREATE INDEX IF NOT EXISTS idx_positions_user ON positions (user_id);

CREATE OR REPLACE TRIGGER set_positions_updated_at
  BEFORE UPDATE ON positions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $migration$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['user_orders', 'house_orders', 'positions']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
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
