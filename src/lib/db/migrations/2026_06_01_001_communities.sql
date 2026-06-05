-- ─── Make users.address nullable (Telegram users have no wallet) ────────────
DO $$
BEGIN
  ALTER TABLE users ALTER COLUMN address DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- ─── Communities ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS communities (
  id           CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  banner_url   TEXT,
  icon_url     TEXT,
  type         TEXT NOT NULL DEFAULT 'public',
  status       TEXT NOT NULL DEFAULT 'active',
  jury_size    SMALLINT NOT NULL DEFAULT 1,
  max_members  INTEGER NOT NULL DEFAULT 5,
  rules        TEXT,
  terms        TEXT,
  creator_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_count INTEGER NOT NULL DEFAULT 1,
  market_count INTEGER NOT NULL DEFAULT 0,
  average_rating NUMERIC(3,2) DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_jury_size CHECK (jury_size BETWEEN 1 AND 10)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_communities_slug
  ON communities (LOWER(slug));

-- ─── Members ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_members (
  id           CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  community_id CHAR(26) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member',
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  invited_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT uniq_community_member UNIQUE (community_id, user_id)
);

-- ─── Community Markets ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_markets (
  id                CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  community_id      CHAR(26) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  event_id          CHAR(26) REFERENCES events(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  resolution_source TEXT,
  resolution_rules  TEXT,
  resolution_date   TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'active',
  resolved_outcome  TEXT,
  resolved_at       TIMESTAMPTZ,
  created_by        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Jury Votes ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jury_votes (
  id                  CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  community_market_id CHAR(26) NOT NULL REFERENCES community_markets(id) ON DELETE CASCADE,
  juror_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote                TEXT NOT NULL,
  reasoning           TEXT NOT NULL,
  evidence_url        TEXT,
  voted_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uniq_jury_vote UNIQUE (community_market_id, juror_id)
);

-- ─── Community Reviews ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_reviews (
  id           CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  community_id CHAR(26) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating       SMALLINT NOT NULL,
  review_text  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uniq_community_review UNIQUE (community_id, user_id),
  CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5)
);

-- ─── Community Invites ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_invites (
  id           CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  community_id CHAR(26) NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  code         TEXT NOT NULL UNIQUE,
  created_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_uses     INTEGER,
  use_count    INTEGER NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

