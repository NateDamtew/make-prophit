-- ─── Phase 2: Communities — verified, monetization ledger, embed configs ────
-- All additive; safe to re-run.

-- 1. Verification + monetization columns on communities -----------------------
ALTER TABLE communities ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS community_fee_bps SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS fee_payout_address TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS verified_by TEXT REFERENCES users(id) ON DELETE SET NULL;

-- 0-1000 bps = 0-10% fee. We cap at 1000 to prevent admin foot-gunning;
-- platform retains veto via /admin/communities controls.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'communities' AND constraint_name = 'chk_communities_fee_bps'
  ) THEN
    ALTER TABLE communities ADD CONSTRAINT chk_communities_fee_bps
      CHECK (community_fee_bps BETWEEN 0 AND 1000);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_communities_is_verified
  ON communities (is_verified) WHERE is_verified = TRUE;


-- 2. community_payouts ledger -------------------------------------------------
-- One row per payout period per community. Status drives the payout UI.
-- Actual payout pipeline (wire/USDC) is deferred; this table is the source
-- of truth once it lands.
CREATE TABLE IF NOT EXISTS community_payouts (
  id                  CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  community_id        CHAR(26) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  period_start        TIMESTAMPTZ NOT NULL,
  period_end          TIMESTAMPTZ NOT NULL,
  gross_volume_usd    NUMERIC(20, 6) NOT NULL DEFAULT 0,
  community_fee_usd   NUMERIC(20, 6) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'pending',
  paid_at             TIMESTAMPTZ,
  paid_tx_hash        TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_community_payouts_status CHECK (status IN ('pending', 'paid', 'voided')),
  CONSTRAINT chk_community_payouts_period CHECK (period_end > period_start)
);

CREATE INDEX IF NOT EXISTS idx_community_payouts_community_period
  ON community_payouts (community_id, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_community_payouts_status
  ON community_payouts (status, created_at DESC);

ALTER TABLE community_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_community_payouts" ON community_payouts;
CREATE POLICY "service_role_all_community_payouts"
  ON community_payouts AS PERMISSIVE FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP TRIGGER IF EXISTS set_community_payouts_updated_at ON community_payouts;
CREATE TRIGGER set_community_payouts_updated_at
  BEFORE UPDATE ON community_payouts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- 3. community_embed_configs --------------------------------------------------
-- Per-community embed appearance + iframe policy. PK on community_id — one
-- config per community. theme jsonb is intentionally schemaless so we can
-- evolve without migrations; allowed_domains empty array means embed-anywhere.
CREATE TABLE IF NOT EXISTS community_embed_configs (
  community_id      CHAR(26) PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,
  theme             JSONB NOT NULL DEFAULT '{"mode":"auto"}'::JSONB,
  allowed_domains   TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE community_embed_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_community_embed_configs" ON community_embed_configs;
CREATE POLICY "service_role_all_community_embed_configs"
  ON community_embed_configs AS PERMISSIVE FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP TRIGGER IF EXISTS set_community_embed_configs_updated_at ON community_embed_configs;
CREATE TRIGGER set_community_embed_configs_updated_at
  BEFORE UPDATE ON community_embed_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
