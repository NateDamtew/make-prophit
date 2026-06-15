-- ─── Phase 3 PR 3.1: Communities — theming + layout presets ─────────────────
-- Additive; safe to re-run. layout_preset goes on the existing communities
-- table; per-community color/font/section overrides live on a new
-- community_themes table so we can evolve the shape without migrations.

-- 1. layout_preset column on communities ------------------------------------
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS layout_preset TEXT NOT NULL DEFAULT 'classic';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'communities' AND constraint_name = 'chk_communities_layout_preset'
  ) THEN
    ALTER TABLE communities
      ADD CONSTRAINT chk_communities_layout_preset
        CHECK (layout_preset IN ('classic', 'newsroom', 'sports', 'forum'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_communities_layout_preset
  ON communities (layout_preset);


-- 2. community_themes (color / font / bounded layout tweaks) -----------------
-- One row per community. JSONB so we can ship new tunables without migrations.
-- empty {} is fine — defaults are computed in the application layer.
CREATE TABLE IF NOT EXISTS community_themes (
  community_id       CHAR(26) PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,
  -- Accent color. NULL = inherit platform primary. Accept OKLCH, hex, or
  -- CSS color keyword; validation happens application-side.
  accent             TEXT,
  -- 'auto' | 'light' | 'dark' — drives the community page's color scheme.
  surface_mode       TEXT NOT NULL DEFAULT 'auto',
  -- 'sans' | 'serif' | 'mono' — UI hint for headlines. The body always uses
  -- the platform font so we never break long-form readability.
  font_hint          TEXT NOT NULL DEFAULT 'sans',
  -- Which preset sections the admin has chosen to hide. The presets reference
  -- this to skip rendering optional sections.
  hidden_sections    JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Optional pinned market for the Newsroom hero.
  featured_market_id CHAR(26) REFERENCES community_markets(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_community_themes_surface_mode
    CHECK (surface_mode IN ('auto', 'light', 'dark')),
  CONSTRAINT chk_community_themes_font_hint
    CHECK (font_hint IN ('sans', 'serif', 'mono'))
);

ALTER TABLE community_themes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_community_themes" ON community_themes;
CREATE POLICY "service_role_all_community_themes"
  ON community_themes AS PERMISSIVE FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

ALTER TABLE community_themes REPLICA IDENTITY FULL;

DROP TRIGGER IF EXISTS set_community_themes_updated_at ON community_themes;
CREATE TRIGGER set_community_themes_updated_at
  BEFORE UPDATE ON community_themes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
