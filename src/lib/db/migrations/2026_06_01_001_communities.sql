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

-- ─── Seed 5 communities for natedamtew + 10 markets ──────────────────────────
DO $$
DECLARE
  admin_user_id TEXT;
  c1_id CHAR(26);
  c2_id CHAR(26);
  c3_id CHAR(26);
  c4_id CHAR(26);
  c5_id CHAR(26);
BEGIN
  -- Find Nathan's user id
  SELECT id INTO admin_user_id
  FROM users
  WHERE LOWER(username) = 'natedamtew' OR LOWER(email) = 'nathandamtew@gmail.com'
  LIMIT 1;

  IF admin_user_id IS NULL THEN
    RAISE NOTICE 'natedamtew user not found, skipping community seed.';
    RETURN;
  END IF;

  -- Check if already seeded
  IF EXISTS (SELECT 1 FROM communities WHERE creator_id = admin_user_id AND slug IN (
    'ethiopian-traders', 'crypto-degens', 'sports-bettors-club', 'inner-circle', 'private-finance-pros'
  )) THEN
    RAISE NOTICE 'Communities already seeded for this user.';
    RETURN;
  END IF;

  -- Community 1: Public, Ethiopian Traders
  INSERT INTO communities (slug, name, description, type, jury_size, max_members, rules, creator_id)
  VALUES (
    'ethiopian-traders', 'Ethiopian Traders',
    'Prediction markets for Ethiopian politics, finance, and emerging tech.',
    'public', 5, 50,
    'Markets must resolve within 90 days. Resolution source must be verifiable.',
    admin_user_id
  ) RETURNING id INTO c1_id;
  INSERT INTO community_members (community_id, user_id, role) VALUES (c1_id, admin_user_id, 'admin');

  -- Community 2: Public, Crypto Degens
  INSERT INTO communities (slug, name, description, type, jury_size, max_members, rules, creator_id)
  VALUES (
    'crypto-degens', 'Crypto Degens',
    'High-volatility crypto prediction markets. BTC, ETH, alts, NFTs.',
    'public', 3, 30,
    'Resolution via CoinMarketCap official price. Settled at UTC midnight.',
    admin_user_id
  ) RETURNING id INTO c2_id;
  INSERT INTO community_members (community_id, user_id, role) VALUES (c2_id, admin_user_id, 'admin');

  -- Community 3: Private, Sports Bettors Club
  INSERT INTO communities (slug, name, description, type, jury_size, max_members, rules, creator_id)
  VALUES (
    'sports-bettors-club', 'Sports Bettors Club',
    'Invite-only group for serious sports prediction markets. Premier League, NBA, F1.',
    'private', 3, 30,
    'Markets follow official league/governing body results only.',
    admin_user_id
  ) RETURNING id INTO c3_id;
  INSERT INTO community_members (community_id, user_id, role) VALUES (c3_id, admin_user_id, 'admin');

  -- Community 4: Private, Inner Circle (small)
  INSERT INTO communities (slug, name, description, type, jury_size, max_members, rules, creator_id)
  VALUES (
    'inner-circle', 'Inner Circle',
    'Friends-only prediction group for personal bets and life events.',
    'private', 1, 5,
    'Be kind. Pay your losses. Have fun.',
    admin_user_id
  ) RETURNING id INTO c4_id;
  INSERT INTO community_members (community_id, user_id, role) VALUES (c4_id, admin_user_id, 'admin');

  -- Community 5: Private, Finance Pros
  INSERT INTO communities (slug, name, description, type, jury_size, max_members, rules, creator_id)
  VALUES (
    'private-finance-pros', 'Finance Pros',
    'Professional finance & macroeconomic predictions. Stocks, forex, central bank policy.',
    'private', 5, 50,
    'Resolution via Bloomberg, Reuters, or central bank official statements.',
    admin_user_id
  ) RETURNING id INTO c5_id;
  INSERT INTO community_members (community_id, user_id, role) VALUES (c5_id, admin_user_id, 'admin');

  -- Markets (2 per community = 10 total)
  -- Ethiopian Traders
  INSERT INTO community_markets (community_id, title, description, resolution_source, resolution_rules, resolution_date, created_by, status)
  VALUES
    (c1_id, 'Will Ethiopia''s real GDP growth exceed 8% in 2026?',
     'Based on World Bank end-of-year reporting.',
     'World Bank Open Data',
     'Resolves YES if World Bank reports real GDP growth ≥ 8.0% for fiscal year 2026.',
     '2026-12-31'::timestamptz, admin_user_id, 'active'),
    (c1_id, 'Will the Ethiopian birr trade below 200 ETB/USD by end of Q3?',
     'Official rate from NBE.',
     'National Bank of Ethiopia',
     'Resolves YES if NBE official rate ≤ 200 ETB/USD on Sept 30, 2026.',
     '2026-09-30'::timestamptz, admin_user_id, 'active');

  -- Crypto Degens
  INSERT INTO community_markets (community_id, title, description, resolution_source, resolution_rules, resolution_date, created_by, status)
  VALUES
    (c2_id, 'Will Bitcoin break $150,000 by end of 2026?',
     'BTC price tracker via CoinMarketCap.',
     'CoinMarketCap',
     'Resolves YES if BTC closes above $150,000 on any day in 2026 per CoinMarketCap daily close.',
     '2026-12-31'::timestamptz, admin_user_id, 'active'),
    (c2_id, 'Will Solana flip Ethereum in market cap in 2026?',
     'Market cap snapshot.',
     'CoinMarketCap',
     'Resolves YES if SOL market cap > ETH market cap on any single day in 2026.',
     '2026-12-31'::timestamptz, admin_user_id, 'active');

  -- Sports Bettors Club
  INSERT INTO community_markets (community_id, title, description, resolution_source, resolution_rules, resolution_date, created_by, status)
  VALUES
    (c3_id, 'Will Arsenal win the 2025-26 Premier League?',
     'Final standings.',
     'Premier League official site',
     'Resolves YES if Arsenal finishes 1st in the official 2025-26 PL final standings.',
     '2026-05-31'::timestamptz, admin_user_id, 'active'),
    (c3_id, 'Will Max Verstappen win the 2026 F1 World Championship?',
     'F1 official standings.',
     'Formula1.com',
     'Resolves YES if Verstappen is the 2026 Drivers'' Champion per official FIA results.',
     '2026-12-15'::timestamptz, admin_user_id, 'active');

  -- Inner Circle
  INSERT INTO community_markets (community_id, title, description, resolution_source, resolution_rules, resolution_date, created_by, status)
  VALUES
    (c4_id, 'Will Sami get married by end of 2026?',
     'Inside joke market.',
     'Group consensus',
     'Resolves YES if Sami enters a legal/religious marriage by Dec 31, 2026.',
     '2026-12-31'::timestamptz, admin_user_id, 'active'),
    (c4_id, 'Will we hit 10K MAU on the app by Q4?',
     'Internal analytics.',
     'PostHog dashboard',
     'Resolves YES if MAU ≥ 10,000 for any month in Q4 2026.',
     '2026-12-31'::timestamptz, admin_user_id, 'active');

  -- Finance Pros
  INSERT INTO community_markets (community_id, title, description, resolution_source, resolution_rules, resolution_date, created_by, status)
  VALUES
    (c5_id, 'Will the Fed cut rates by 50bps before September 2026?',
     'FOMC meeting outcomes.',
     'Federal Reserve official statements',
     'Resolves YES if the Fed announces a cumulative cut of ≥50bps between now and Aug 31, 2026.',
     '2026-08-31'::timestamptz, admin_user_id, 'active'),
    (c5_id, 'Will S&P 500 close above 7,000 by year-end?',
     'S&P 500 closing index.',
     'Bloomberg / S&P Dow Jones Indices',
     'Resolves YES if SPX closes ≥ 7,000 on Dec 31, 2026.',
     '2026-12-31'::timestamptz, admin_user_id, 'active');

  -- Update market counts
  UPDATE communities SET market_count = 2 WHERE id IN (c1_id, c2_id, c3_id, c4_id, c5_id);
END $$;
