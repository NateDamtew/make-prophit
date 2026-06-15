-- ─── Phase 3 PR 3.2: editorial integrity + community-level moderation ───────
-- All additive; safe to re-run.

-- 1. Moderation columns on community_markets --------------------------------
-- Pinning a market lifts it to the top of every preset's market list.
-- Locking prevents new comments without affecting visibility.
-- Archiving soft-deletes the market from the public list without losing the
-- ledger of resolutions and bets that may eventually exist.
ALTER TABLE community_markets
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE community_markets
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE community_markets
  ADD COLUMN IF NOT EXISTS locked_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE community_markets
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE community_markets
  ADD COLUMN IF NOT EXISTS archived_by TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_community_markets_pinned
  ON community_markets (community_id, is_pinned)
  WHERE is_pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_community_markets_archived
  ON community_markets (archived_at)
  WHERE archived_at IS NOT NULL;


-- 2. market_resolution_evidence (community-admin attached) -------------------
-- Pre/post resolution evidence URLs the community admin or jurors attach to
-- a market. This is distinct from jury_votes.evidence_url which is one URL
-- per juror per vote. The community-level evidence is the source-of-truth
-- audit trail BBC needs to point to when defending a resolution.
CREATE TABLE IF NOT EXISTS market_resolution_evidence (
  id            CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  market_id     CHAR(26) NOT NULL REFERENCES community_markets(id) ON DELETE CASCADE,
  community_id  CHAR(26) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  note          TEXT,
  submitted_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  submitted_label TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_market_resolution_evidence_url_len
    CHECK (char_length(url) BETWEEN 8 AND 2048),
  CONSTRAINT chk_market_resolution_evidence_note_len
    CHECK (note IS NULL OR char_length(note) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_market_resolution_evidence_market
  ON market_resolution_evidence (market_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_resolution_evidence_community
  ON market_resolution_evidence (community_id, created_at DESC);

ALTER TABLE market_resolution_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_market_resolution_evidence"
  ON market_resolution_evidence;
CREATE POLICY "service_role_all_market_resolution_evidence"
  ON market_resolution_evidence AS PERMISSIVE FOR ALL
  TO service_role USING (TRUE) WITH CHECK (TRUE);

ALTER TABLE market_resolution_evidence REPLICA IDENTITY FULL;


-- 3. White-label opt-in column on communities -------------------------------
-- Only takes effect when is_verified=true (the application checks both).
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS white_label BOOLEAN NOT NULL DEFAULT FALSE;
