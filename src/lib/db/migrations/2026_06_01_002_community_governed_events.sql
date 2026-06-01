-- ─── Add community ownership to events ───────────────────────────────────────
-- Events with a community_id are only visible to community members.
-- Events without community_id remain public (existing behavior).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'events' AND column_name = 'community_id'
  ) THEN
    ALTER TABLE events
      ADD COLUMN community_id CHAR(26)
      REFERENCES communities(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_community_id
  ON events (community_id)
  WHERE community_id IS NOT NULL;

-- ─── Add jury-governance flag to conditions ──────────────────────────────────
-- conditions.community_governed = true means resolution comes from jury votes,
-- not UMA oracle. The resolution sync job must skip these.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conditions' AND column_name = 'community_governed'
  ) THEN
    ALTER TABLE conditions
      ADD COLUMN community_governed BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conditions_community_governed
  ON conditions (community_governed)
  WHERE community_governed = TRUE;

-- ─── Backfill: link existing community_markets to their events ───────────────
-- Any community_markets row with an event_id should propagate the community_id
-- to the corresponding event for visibility filtering.
DO $$
BEGIN
  UPDATE events e
  SET community_id = cm.community_id
  FROM community_markets cm
  WHERE cm.event_id = e.id
    AND e.community_id IS NULL
    AND cm.event_id IS NOT NULL;
END $$;
