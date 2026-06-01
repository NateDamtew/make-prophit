-- ─── Add review workflow + deployment tracking to community_markets ──────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_markets' AND column_name = 'review_status'
  ) THEN
    ALTER TABLE community_markets ADD COLUMN review_status TEXT;
    -- review_status values:
    -- NULL          → draft (no review needed yet)
    -- 'pending'     → submitted, waiting for super admin
    -- 'approved'    → approved, queued for deploy
    -- 'rejected'    → rejected with feedback (back to draft)
    -- 'deploying'   → deploy in progress
    -- 'deploy_failed' → first deploy attempt failed
    -- 'deploy_retry'  → auto-retry in progress
    -- 'deploy_blocked' → super admin marked as blocked
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_markets' AND column_name = 'review_feedback'
  ) THEN
    ALTER TABLE community_markets ADD COLUMN review_feedback TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_markets' AND column_name = 'reviewed_by'
  ) THEN
    ALTER TABLE community_markets
      ADD COLUMN reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_markets' AND column_name = 'reviewed_at'
  ) THEN
    ALTER TABLE community_markets ADD COLUMN reviewed_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_markets' AND column_name = 'submitted_at'
  ) THEN
    ALTER TABLE community_markets ADD COLUMN submitted_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_markets' AND column_name = 'main_category_slug'
  ) THEN
    ALTER TABLE community_markets ADD COLUMN main_category_slug TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_markets' AND column_name = 'category_slugs'
  ) THEN
    ALTER TABLE community_markets ADD COLUMN category_slugs TEXT[] DEFAULT '{}'::TEXT[];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_markets' AND column_name = 'deploy_attempts'
  ) THEN
    ALTER TABLE community_markets ADD COLUMN deploy_attempts INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_markets' AND column_name = 'last_deploy_error'
  ) THEN
    ALTER TABLE community_markets ADD COLUMN last_deploy_error TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_markets' AND column_name = 'event_creation_draft_id'
  ) THEN
    ALTER TABLE community_markets ADD COLUMN event_creation_draft_id CHAR(26);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_community_markets_review_status
  ON community_markets (review_status)
  WHERE review_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_community_markets_event_creation
  ON community_markets (event_creation_draft_id)
  WHERE event_creation_draft_id IS NOT NULL;
