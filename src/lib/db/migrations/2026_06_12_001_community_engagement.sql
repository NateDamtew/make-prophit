-- ─── Phase 1: Community Engagement Layer ─────────────────────────────────────
-- Powers comments, reactions, and the activity feed on community pages. Wired
-- for Supabase Realtime (RLS + REPLICA IDENTITY FULL) so client subscriptions
-- can stream changes without further schema migrations.

-- ─── 1. community_comments ───────────────────────────────────────────────────
-- Threaded discussion on community markets. parent_id self-references for one
-- level of nesting (depth enforced application-side). Soft-delete via
-- deleted_at preserves thread shape after a delete.
CREATE TABLE IF NOT EXISTS community_comments (
  id              CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  market_id       CHAR(26) NOT NULL REFERENCES community_markets(id) ON DELETE CASCADE,
  community_id    CHAR(26) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id       CHAR(26) REFERENCES community_comments(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  edited_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  -- Denormalised counts kept in sync via triggers below.
  reply_count     INTEGER NOT NULL DEFAULT 0,
  reaction_count  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_community_comments_body_len CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS idx_community_comments_market_created
  ON community_comments (market_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_comments_community_created
  ON community_comments (community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_comments_user
  ON community_comments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_comments_parent
  ON community_comments (parent_id)
  WHERE parent_id IS NOT NULL;

ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_community_comments" ON community_comments;
CREATE POLICY "service_role_all_community_comments"
  ON community_comments AS PERMISSIVE FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Realtime change-feed needs the full row payload for UPDATE/DELETE deltas.
ALTER TABLE community_comments REPLICA IDENTITY FULL;

DROP TRIGGER IF EXISTS set_community_comments_updated_at ON community_comments;
CREATE TRIGGER set_community_comments_updated_at
  BEFORE UPDATE ON community_comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Keep parent reply_count in sync without app-level work.
CREATE OR REPLACE FUNCTION community_comments_bump_reply_count() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.parent_id IS NOT NULL THEN
      UPDATE community_comments SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.parent_id IS NOT NULL THEN
      UPDATE community_comments SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = OLD.parent_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_community_comments_reply_count ON community_comments;
CREATE TRIGGER trg_community_comments_reply_count
  AFTER INSERT OR DELETE ON community_comments
  FOR EACH ROW EXECUTE FUNCTION community_comments_bump_reply_count();


-- ─── 2. community_reactions ──────────────────────────────────────────────────
-- Generic reaction table — one row per (user, target, kind). target_type lets
-- the same table back both market and comment reactions without a second table.
CREATE TABLE IF NOT EXISTS community_reactions (
  id            CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  community_id  CHAR(26) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  target_type   TEXT NOT NULL,
  target_id     CHAR(26) NOT NULL,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_community_reactions_target_type CHECK (target_type IN ('market', 'comment')),
  CONSTRAINT chk_community_reactions_kind CHECK (kind IN ('like', 'fire', 'target', 'thinking')),
  CONSTRAINT uniq_community_reactions UNIQUE (target_type, target_id, user_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_community_reactions_target
  ON community_reactions (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_community_reactions_user_created
  ON community_reactions (user_id, created_at DESC);

ALTER TABLE community_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_community_reactions" ON community_reactions;
CREATE POLICY "service_role_all_community_reactions"
  ON community_reactions AS PERMISSIVE FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

ALTER TABLE community_reactions REPLICA IDENTITY FULL;

-- Keep community_comments.reaction_count in sync when comment reactions
-- arrive/leave. Market reactions are counted via a query at read time.
CREATE OR REPLACE FUNCTION community_reactions_bump_comment_count() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.target_type = 'comment' THEN
      UPDATE community_comments SET reaction_count = reaction_count + 1 WHERE id = NEW.target_id;
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.target_type = 'comment' THEN
      UPDATE community_comments SET reaction_count = GREATEST(reaction_count - 1, 0) WHERE id = OLD.target_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_community_reactions_comment_count ON community_reactions;
CREATE TRIGGER trg_community_reactions_comment_count
  AFTER INSERT OR DELETE ON community_reactions
  FOR EACH ROW EXECUTE FUNCTION community_reactions_bump_comment_count();


-- ─── 3. community_events ─────────────────────────────────────────────────────
-- Append-only activity log. Every meaningful action in a community writes one
-- row here. Powers the Activity tab, the live ticker, and (in Phase 2) the
-- analytics dashboard. Payload denormalises display data so feed rendering
-- never needs N joins.
CREATE TABLE IF NOT EXISTS community_events (
  id              CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  community_id    CHAR(26) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  actor_user_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_label     TEXT,
  kind            TEXT NOT NULL,
  target_type     TEXT,
  target_id       CHAR(26),
  payload         JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_events_community_created
  ON community_events (community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_events_kind
  ON community_events (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_events_target
  ON community_events (target_type, target_id)
  WHERE target_id IS NOT NULL;

ALTER TABLE community_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_community_events" ON community_events;
CREATE POLICY "service_role_all_community_events"
  ON community_events AS PERMISSIVE FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

ALTER TABLE community_events REPLICA IDENTITY FULL;


-- ─── 4. community_notification_prefs ─────────────────────────────────────────
-- Per-user per-community mute toggles. Absent row = all categories on (default).
-- Notifications dispatcher reads this; never mutated by background jobs.
CREATE TABLE IF NOT EXISTS community_notification_prefs (
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id      CHAR(26) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  mute_comments     BOOLEAN NOT NULL DEFAULT FALSE,
  mute_markets      BOOLEAN NOT NULL DEFAULT FALSE,
  mute_resolutions  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, community_id)
);

ALTER TABLE community_notification_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_community_notification_prefs" ON community_notification_prefs;
CREATE POLICY "service_role_all_community_notification_prefs"
  ON community_notification_prefs AS PERMISSIVE FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP TRIGGER IF EXISTS set_community_notification_prefs_updated_at ON community_notification_prefs;
CREATE TRIGGER set_community_notification_prefs_updated_at
  BEFORE UPDATE ON community_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
