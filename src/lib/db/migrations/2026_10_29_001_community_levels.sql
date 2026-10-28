-- Fork: Communities v1 — trust levels, lifecycle status, team roles.
-- See notes/COMMUNITIES-CONCEPT.md §3 (two doors, one ladder) and §7 (roles).
--
-- `tier` (pool | orderbook) stays the market engine switch. `level` is the
-- trust ladder shown to members (0 New, 1 Proven, 2 Established) and drives
-- caps, review mode and the pool share. Both are independent.

ALTER TABLE communities ADD COLUMN IF NOT EXISTS level SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS level_changed_at TIMESTAMPTZ;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS trust_score SMALLINT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS trust_updated_at TIMESTAMPTZ;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS joins_paused BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS joins_paused_reason TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS last_market_at TIMESTAMPTZ;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS upheld_appeal_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS caps_override JSONB;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS review_mode_override TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS leader_type TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS frozen_reason TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;

UPDATE communities SET level_changed_at = created_at WHERE level_changed_at IS NULL;
UPDATE communities SET last_market_at = (
  SELECT MAX(created_at) FROM community_markets WHERE community_markets.community_id = communities.id
) WHERE last_market_at IS NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_communities_level') THEN
    ALTER TABLE communities ADD CONSTRAINT chk_communities_level CHECK (level BETWEEN 0 AND 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_communities_trust_score') THEN
    ALTER TABLE communities ADD CONSTRAINT chk_communities_trust_score
      CHECK (trust_score IS NULL OR trust_score BETWEEN 0 AND 100);
  END IF;
  -- 'paused' = frozen by Prophit (no new stakes); 'dormant' = no markets for a while.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_communities_status') THEN
    ALTER TABLE communities ADD CONSTRAINT chk_communities_status
      CHECK (status IN ('active', 'paused', 'dormant', 'archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_communities_review_mode_override') THEN
    ALTER TABLE communities ADD CONSTRAINT chk_communities_review_mode_override
      CHECK (review_mode_override IS NULL OR review_mode_override IN ('every', 'spot', 'none'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_communities_leader_type') THEN
    ALTER TABLE communities ADD CONSTRAINT chk_communities_leader_type
      CHECK (leader_type IS NULL OR leader_type IN ('news', 'sports', 'creator', 'group', 'event'));
  END IF;
END
$migration$;

-- Team roles: editors write markets, moderators tidy comments, co-owners do
-- everything the owner does. Jurors and members unchanged.
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_community_members_role') THEN
    ALTER TABLE community_members ADD CONSTRAINT chk_community_members_role
      CHECK (role IN ('admin', 'co_owner', 'editor', 'moderator', 'juror', 'member'));
  END IF;
END
$migration$;

-- Append-only log of every level / status / trust change, with who and why.
CREATE TABLE IF NOT EXISTS community_trust_events (
  id            CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  community_id  CHAR(26) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  from_level    SMALLINT,
  to_level      SMALLINT,
  trust_before  SMALLINT,
  trust_after   SMALLINT,
  reason        TEXT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_community_trust_events_kind CHECK (
    kind IN ('promoted', 'demoted', 'frozen', 'unfrozen', 'dormant', 'reactivated',
             'trust_recomputed', 'joins_paused', 'joins_resumed', 'caps_changed')
  )
);

CREATE INDEX IF NOT EXISTS idx_community_trust_events_community
  ON community_trust_events (community_id, created_at DESC);

ALTER TABLE public.community_trust_events ENABLE ROW LEVEL SECURITY;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'community_trust_events'
      AND policyname = 'service_role_all_community_trust_events'
  ) THEN
    CREATE POLICY service_role_all_community_trust_events
      ON public.community_trust_events TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$migration$;
