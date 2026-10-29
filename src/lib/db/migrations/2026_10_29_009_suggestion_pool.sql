-- Fork: Communities v1 — the suggestion pool.
-- See notes/COMMUNITIES-CONCEPT.md §8 (AI suggestion pool).
--
-- Market drafts Prophit prepares (by hand, or from a link through the AI
-- drafter), checks and approves, then offers to communities. An owner adds
-- one as drafted or edits it first; the result is an ordinary community
-- market that goes through the usual review.

CREATE TABLE IF NOT EXISTS market_suggestions (
  id CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  title TEXT NOT NULL,
  description TEXT,
  market_mode TEXT NOT NULL DEFAULT 'binary',
  outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolution_rules TEXT,
  resolution_source TEXT,
  source_url TEXT,
  source_name TEXT,
  source_published_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  event_at TIMESTAMPTZ,
  main_category_slug TEXT,
  category_slugs TEXT[] NOT NULL DEFAULT '{}'::text[],
  checks JSONB NOT NULL DEFAULT '{"dated": false, "publicSource": false, "closesBeforeEvent": false}'::jsonb,
  confidence NUMERIC(4, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  origin TEXT NOT NULL DEFAULT 'admin',
  expires_at TIMESTAMPTZ,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_market_suggestions_status CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  CONSTRAINT chk_market_suggestions_mode CHECK (market_mode IN ('binary', 'list')),
  CONSTRAINT chk_market_suggestions_origin CHECK (origin IN ('ai', 'admin'))
);
CREATE INDEX IF NOT EXISTS idx_market_suggestions_status ON market_suggestions (status, created_at DESC);
ALTER TABLE public.market_suggestions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS market_suggestion_targets (
  id CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  suggestion_id CHAR(26) NOT NULL REFERENCES market_suggestions(id) ON DELETE CASCADE,
  community_id CHAR(26) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'suggested',
  community_market_id CHAR(26) REFERENCES community_markets(id) ON DELETE SET NULL,
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uniq_market_suggestion_target UNIQUE (suggestion_id, community_id),
  CONSTRAINT chk_market_suggestion_targets_status CHECK (status IN ('suggested', 'added', 'dismissed'))
);
CREATE INDEX IF NOT EXISTS idx_market_suggestion_targets_community ON market_suggestion_targets (community_id, status);
ALTER TABLE public.market_suggestion_targets ENABLE ROW LEVEL SECURITY;
