-- Community pools (parimutuel engine for community markets) + community tiers.
-- See LOCAL-PAYMENTS-DESIGN.md §6.2 and §6.3.

-- Communities default to the pool engine; promotion to the Kuest order book is
-- a tier change that affects NEW markets only.
ALTER TABLE communities ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'pool';
ALTER TABLE communities ADD COLUMN IF NOT EXISTS currency CHAR(3);
ALTER TABLE communities ADD COLUMN IF NOT EXISTS tier_changed_at TIMESTAMPTZ;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS tier_override TEXT;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_communities_tier') THEN
    ALTER TABLE communities ADD CONSTRAINT chk_communities_tier CHECK (tier IN ('pool', 'orderbook'));
  END IF;
END
$migration$;

-- Each community market records which engine it was created on; immutable after creation.
ALTER TABLE community_markets ADD COLUMN IF NOT EXISTS engine TEXT NOT NULL DEFAULT 'pool';

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_community_markets_engine') THEN
    ALTER TABLE community_markets ADD CONSTRAINT chk_community_markets_engine CHECK (engine IN ('pool', 'orderbook'));
  END IF;
END
$migration$;

-- Markets that already went on-chain keep the order-book engine.
UPDATE community_markets SET engine = 'orderbook' WHERE event_id IS NOT NULL AND engine = 'pool';

CREATE TABLE IF NOT EXISTS pools (
  id                  CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  community_market_id CHAR(26) NOT NULL UNIQUE REFERENCES community_markets(id) ON DELETE RESTRICT,
  community_id        CHAR(26) NOT NULL REFERENCES communities(id) ON DELETE RESTRICT,
  currency            CHAR(3) NOT NULL,
  rake_bps            INTEGER NOT NULL DEFAULT 400,
  creator_share_bps   INTEGER NOT NULL DEFAULT 0,
  state               TEXT NOT NULL DEFAULT 'open',
  closes_at           TIMESTAMPTZ,
  total_yes           BIGINT NOT NULL DEFAULT 0,
  total_no            BIGINT NOT NULL DEFAULT 0,
  stake_count         INTEGER NOT NULL DEFAULT 0,
  settled_outcome     TEXT,
  settled_at          TIMESTAMPTZ,
  settlement_tx_id    CHAR(26) REFERENCES ledger_transactions(id) ON DELETE SET NULL,
  rake_paid           BIGINT NOT NULL DEFAULT 0,
  creator_paid        BIGINT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_pools_state CHECK (state IN ('open', 'closed', 'settled', 'cancelled')),
  CONSTRAINT chk_pools_outcome CHECK (settled_outcome IS NULL OR settled_outcome IN ('yes', 'no', 'cancelled')),
  CONSTRAINT chk_pools_rake CHECK (rake_bps BETWEEN 0 AND 2000 AND creator_share_bps BETWEEN 0 AND 10000)
);

CREATE INDEX IF NOT EXISTS idx_pools_community ON pools (community_id);
CREATE INDEX IF NOT EXISTS idx_pools_state ON pools (state);

CREATE OR REPLACE TRIGGER set_pools_updated_at
  BEFORE UPDATE ON pools FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS pool_stakes (
  id                    CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  pool_id               CHAR(26) NOT NULL REFERENCES pools(id) ON DELETE RESTRICT,
  user_id               CHAR(26) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  outcome               TEXT NOT NULL,
  amount                BIGINT NOT NULL,
  currency              CHAR(3) NOT NULL,
  payout                BIGINT,
  ledger_transaction_id CHAR(26) REFERENCES ledger_transactions(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_pool_stakes_outcome CHECK (outcome IN ('yes', 'no')),
  CONSTRAINT chk_pool_stakes_amount CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_pool_stakes_pool_user ON pool_stakes (pool_id, user_id);
CREATE INDEX IF NOT EXISTS idx_pool_stakes_user_created ON pool_stakes (user_id, created_at);

ALTER TABLE public.pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_stakes ENABLE ROW LEVEL SECURITY;

-- service_role policies (idempotent)
DO $migration$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['pools', 'pool_stakes']
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
