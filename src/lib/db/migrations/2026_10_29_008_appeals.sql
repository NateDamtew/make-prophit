-- Fork: Communities v1 step 5 — appeals with escrow.
-- See notes/COMMUNITIES-CONCEPT.md §6 (hold and appeals).
--
-- A staker files one appeal per market during the hold; other stakers back
-- it with escrow (a ledger reservation on their cash). When enough backers
-- or enough escrow is in, payouts freeze and Prophit rules: the result
-- stands (escrow forfeited), flips to the claim (escrow back), or the market
-- is voided (everything back). Opinions from jurors of other communities
-- are recorded alongside.

CREATE TABLE IF NOT EXISTS market_appeals (
  id CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  community_market_id CHAR(26) NOT NULL REFERENCES community_markets(id) ON DELETE CASCADE,
  pool_id CHAR(26) NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  filed_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_outcome TEXT NOT NULL,
  claimed_outcome TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  backers_needed INTEGER NOT NULL,
  escrow_target BIGINT NOT NULL,
  backer_count INTEGER NOT NULL DEFAULT 0,
  escrow_total BIGINT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL,
  window_ends_at TIMESTAMPTZ NOT NULL,
  threshold_met_at TIMESTAMPTZ,
  ruling TEXT,
  ruling_text TEXT,
  ruled_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ruled_at TIMESTAMPTZ,
  ruling_tx_id CHAR(26),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_market_appeals_original CHECK (original_outcome IN ('yes', 'no')),
  CONSTRAINT chk_market_appeals_claim CHECK (claimed_outcome IN ('yes', 'no', 'cancelled')),
  CONSTRAINT chk_market_appeals_status CHECK (
    status IN ('open', 'threshold_met', 'under_review', 'rejected', 'upheld', 'voided', 'withdrawn', 'expired')
  )
);
CREATE INDEX IF NOT EXISTS idx_market_appeals_market ON market_appeals (community_market_id);
CREATE INDEX IF NOT EXISTS idx_market_appeals_status ON market_appeals (status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_market_appeal_active ON market_appeals (community_market_id)
  WHERE status IN ('open', 'threshold_met', 'under_review');
ALTER TABLE public.market_appeals ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS appeal_backers (
  id CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  appeal_id CHAR(26) NOT NULL REFERENCES market_appeals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  reservation_id CHAR(26) NOT NULL,
  state TEXT NOT NULL DEFAULT 'held',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  CONSTRAINT uniq_appeal_backer UNIQUE (appeal_id, user_id),
  CONSTRAINT chk_appeal_backers_state CHECK (state IN ('held', 'returned', 'forfeited')),
  CONSTRAINT chk_appeal_backers_amount CHECK (amount > 0)
);
ALTER TABLE public.appeal_backers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS appeal_juror_opinions (
  id CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  appeal_id CHAR(26) NOT NULL REFERENCES market_appeals(id) ON DELETE CASCADE,
  juror_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opinion TEXT,
  reasoning TEXT,
  asked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  CONSTRAINT uniq_appeal_juror_opinion UNIQUE (appeal_id, juror_id),
  CONSTRAINT chk_appeal_juror_opinion CHECK (opinion IS NULL OR opinion IN ('stand', 'flip', 'void'))
);
ALTER TABLE public.appeal_juror_opinions ENABLE ROW LEVEL SECURITY;
