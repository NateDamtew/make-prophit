-- Fork: Communities v1 step 2 — payout hold and the owner / jury / Prophit rake split.
-- See notes/COMMUNITIES-CONCEPT.md §5 (money) and §6 (resolution, hold).
--
-- A pool now passes through 'held' between the jury result and the payout:
-- payouts are computed and written to pool_stakes.payout at once, the ledger
-- transaction is posted only when the hold ends (or an admin ruling forces it).

ALTER TABLE pools DROP CONSTRAINT IF EXISTS chk_pools_state;
ALTER TABLE pools ADD CONSTRAINT chk_pools_state CHECK (state IN ('open', 'closed', 'held', 'settled', 'cancelled'));

ALTER TABLE pools ADD COLUMN IF NOT EXISTS owner_share_bps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pools ADD COLUMN IF NOT EXISTS jury_share_bps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pools ADD COLUMN IF NOT EXISTS is_imported BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pools ADD COLUMN IF NOT EXISTS planned_outcome TEXT;
ALTER TABLE pools ADD COLUMN IF NOT EXISTS result_announced_at TIMESTAMPTZ;
ALTER TABLE pools ADD COLUMN IF NOT EXISTS hold_until TIMESTAMPTZ;
ALTER TABLE pools ADD COLUMN IF NOT EXISTS hold_extended_until TIMESTAMPTZ;
ALTER TABLE pools ADD COLUMN IF NOT EXISTS payouts_frozen BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pools ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;
ALTER TABLE pools ADD COLUMN IF NOT EXISTS owner_paid BIGINT NOT NULL DEFAULT 0;
ALTER TABLE pools ADD COLUMN IF NOT EXISTS jury_paid BIGINT NOT NULL DEFAULT 0;
ALTER TABLE pools ADD COLUMN IF NOT EXISTS voting_juror_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE pools ADD COLUMN IF NOT EXISTS closing_notified_at TIMESTAMPTZ;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pools_planned_outcome') THEN
    ALTER TABLE pools ADD CONSTRAINT chk_pools_planned_outcome
      CHECK (planned_outcome IS NULL OR planned_outcome IN ('yes', 'no', 'cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pools_shares') THEN
    ALTER TABLE pools ADD CONSTRAINT chk_pools_shares
      CHECK (owner_share_bps BETWEEN 0 AND 10000 AND jury_share_bps BETWEEN 0 AND 10000
             AND owner_share_bps + jury_share_bps <= 10000);
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS idx_pools_hold_until ON pools (hold_until) WHERE state = 'held';

ALTER TABLE pool_stakes ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Owners and jurors are paid from the pool share; an account without a ledger
-- profile in the pool's currency accrues to a payable account instead.
ALTER TABLE ledger_accounts DROP CONSTRAINT IF EXISTS chk_ledger_accounts_kind;
ALTER TABLE ledger_accounts ADD CONSTRAINT chk_ledger_accounts_kind CHECK (
  kind IN ('user_cash', 'float', 'fees', 'rounding', 'pool_rake', 'pool', 'fx', 'fx_clearing', 'settlement',
           'suspense', 'earnings_payable')
);

-- What each owner / juror earned, per pool: "your pay this month".
CREATE TABLE IF NOT EXISTS community_earnings (
  id                    CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  community_id          CHAR(26) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                  TEXT NOT NULL,
  pool_id               CHAR(26) REFERENCES pools(id) ON DELETE SET NULL,
  appeal_id             CHAR(26),
  amount                BIGINT NOT NULL,
  currency              CHAR(3) NOT NULL,
  ledger_transaction_id CHAR(26) REFERENCES ledger_transactions(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_community_earnings_role CHECK (role IN ('owner', 'juror', 'appeal_juror')),
  CONSTRAINT chk_community_earnings_amount CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_community_earnings_user ON community_earnings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_earnings_community ON community_earnings (community_id, created_at DESC);

ALTER TABLE public.community_earnings ENABLE ROW LEVEL SECURITY;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'community_earnings'
      AND policyname = 'service_role_all_community_earnings'
  ) THEN
    CREATE POLICY service_role_all_community_earnings
      ON public.community_earnings TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$migration$;
