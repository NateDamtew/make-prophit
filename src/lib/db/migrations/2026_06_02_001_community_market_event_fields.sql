-- ─── Add platform-event-shaped fields to community_markets ───────────────────
-- These mirror what the super admin's 5-step event creation form captures so
-- community markets can be deployed via the same on-chain pipeline.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_markets' AND column_name = 'slug'
  ) THEN
    ALTER TABLE community_markets ADD COLUMN slug TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_markets' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE community_markets ADD COLUMN image_url TEXT;
  END IF;

  -- Market structure
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_markets' AND column_name = 'market_mode'
  ) THEN
    ALTER TABLE community_markets
      ADD COLUMN market_mode TEXT NOT NULL DEFAULT 'binary';
    -- 'binary' or 'multi_unique' or 'multi_multiple'
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_markets' AND column_name = 'binary_question'
  ) THEN
    ALTER TABLE community_markets ADD COLUMN binary_question TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_markets' AND column_name = 'binary_outcome_yes'
  ) THEN
    ALTER TABLE community_markets
      ADD COLUMN binary_outcome_yes TEXT NOT NULL DEFAULT 'Yes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_markets' AND column_name = 'binary_outcome_no'
  ) THEN
    ALTER TABLE community_markets
      ADD COLUMN binary_outcome_no TEXT NOT NULL DEFAULT 'No';
  END IF;

  -- Multi-option markets store their option list as JSONB
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'community_markets' AND column_name = 'options'
  ) THEN
    ALTER TABLE community_markets ADD COLUMN options JSONB DEFAULT '[]'::JSONB;
  END IF;
END $$;
