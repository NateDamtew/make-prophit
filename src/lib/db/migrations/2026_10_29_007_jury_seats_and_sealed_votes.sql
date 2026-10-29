-- Fork: Communities v1 step 4 — jury seats, sealed votes, loser ratings, juror records.
-- See notes/COMMUNITIES-CONCEPT.md §4 (jury).
--
-- A market gets its seats when it goes live. Only seated jurors vote; votes
-- stay sealed until every seat has voted or the deadline passes, then open
-- together. A missed deadline refunds the market and marks the missing
-- jurors late. Losers rate the resolution; juror_stats caches each juror's
-- public record.

ALTER TABLE community_markets ADD COLUMN IF NOT EXISTS jury_seat_count SMALLINT;
ALTER TABLE community_markets ADD COLUMN IF NOT EXISTS jury_required_votes SMALLINT;
ALTER TABLE community_markets ADD COLUMN IF NOT EXISTS jury_deadline_at TIMESTAMPTZ;
ALTER TABLE community_markets ADD COLUMN IF NOT EXISTS votes_revealed_at TIMESTAMPTZ;
ALTER TABLE community_markets ADD COLUMN IF NOT EXISTS result_announced_at TIMESTAMPTZ;
ALTER TABLE community_markets ADD COLUMN IF NOT EXISTS jury_notified_at TIMESTAMPTZ;
ALTER TABLE community_markets ADD COLUMN IF NOT EXISTS resolution_kind TEXT;
ALTER TABLE community_markets ADD COLUMN IF NOT EXISTS late_resolution BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE jury_votes ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE jury_votes ADD COLUMN IF NOT EXISTS sealed_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE jury_votes ADD COLUMN IF NOT EXISTS revealed_at TIMESTAMPTZ;
ALTER TABLE jury_votes ADD COLUMN IF NOT EXISTS correction_note TEXT;
ALTER TABLE jury_votes ADD COLUMN IF NOT EXISTS correction_note_at TIMESTAMPTZ;
ALTER TABLE jury_votes ADD COLUMN IF NOT EXISTS was_late BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE jury_votes ADD COLUMN IF NOT EXISTS agreed_with_outcome BOOLEAN;
ALTER TABLE jury_votes ADD COLUMN IF NOT EXISTS overturned BOOLEAN NOT NULL DEFAULT FALSE;

-- Votes cast before this step on markets that have already been decided are public.
UPDATE jury_votes v
SET revealed_at = COALESCE(v.revealed_at, m.resolved_at, v.voted_at),
    agreed_with_outcome = CASE
      WHEN m.resolved_outcome IN ('yes', 'no') THEN v.vote = m.resolved_outcome
      ELSE NULL
    END
FROM community_markets m
WHERE m.id = v.community_market_id
  AND m.status IN ('resolved', 'disputed', 'cancelled')
  AND v.revealed_at IS NULL;

CREATE TABLE IF NOT EXISTS market_jury_seats (
  id CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  community_market_id CHAR(26) NOT NULL REFERENCES community_markets(id) ON DELETE CASCADE,
  juror_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uniq_market_jury_seat UNIQUE (community_market_id, juror_id)
);
CREATE INDEX IF NOT EXISTS idx_market_jury_seats_juror ON market_jury_seats (juror_id);
ALTER TABLE public.market_jury_seats ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS market_resolution_ratings (
  id CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  community_market_id CHAR(26) NOT NULL REFERENCES community_markets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uniq_market_resolution_rating UNIQUE (community_market_id, user_id),
  CONSTRAINT chk_market_resolution_rating CHECK (rating BETWEEN 1 AND 5)
);
ALTER TABLE public.market_resolution_ratings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS juror_stats (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  markets_voted INTEGER NOT NULL DEFAULT 0,
  on_time INTEGER NOT NULL DEFAULT 0,
  late INTEGER NOT NULL DEFAULT 0,
  agreed INTEGER NOT NULL DEFAULT 0,
  overturned INTEGER NOT NULL DEFAULT 0,
  rating_sum INTEGER NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  dissent_proven INTEGER NOT NULL DEFAULT 0,
  first_voted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.juror_stats ENABLE ROW LEVEL SECURITY;
