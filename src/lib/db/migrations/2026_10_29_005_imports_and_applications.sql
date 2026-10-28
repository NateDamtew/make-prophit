-- Communities v1 step 7: markets imported from the main Prophit catalogue
-- (settled from their source, no jury) and leader applications.
-- Additive; safe to re-run.

ALTER TABLE community_markets ADD COLUMN IF NOT EXISTS source_event_id CHAR(26);
ALTER TABLE community_markets ADD COLUMN IF NOT EXISTS source_condition_id TEXT;
ALTER TABLE community_markets ADD COLUMN IF NOT EXISTS source_platform TEXT;
CREATE INDEX IF NOT EXISTS idx_community_markets_source_condition
  ON community_markets (source_condition_id) WHERE source_condition_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS community_applications (
  id CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leader_type TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL,
  audience TEXT,
  sample_markets JSONB NOT NULL DEFAULT '[]'::jsonb,
  links JSONB NOT NULL DEFAULT '[]'::jsonb,
  currency CHAR(3) NOT NULL DEFAULT 'KES',
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  start_level SMALLINT,
  community_id CHAR(26) REFERENCES communities(id) ON DELETE SET NULL,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_community_applications_status CHECK (status IN ('pending', 'more_info', 'approved', 'rejected', 'withdrawn')),
  CONSTRAINT chk_community_applications_leader_type CHECK (leader_type IN ('news', 'sports', 'creator', 'group', 'event'))
);
CREATE INDEX IF NOT EXISTS idx_community_applications_user ON community_applications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_applications_status ON community_applications (status, created_at DESC);
