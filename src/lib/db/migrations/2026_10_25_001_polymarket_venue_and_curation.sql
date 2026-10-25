-- Fork: Polymarket-native events and admin curation.
--
-- Polymarket events are imported from Polymarket's Gamma API into the regular
-- events/markets/outcomes tables, marked with venue = 'polymarket'. Their pages
-- read prices, books and history from Polymarket instead of Kuest.
-- See src/lib/polymarket/* and src/app/api/sync/polymarket/route.ts.
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue TEXT NOT NULL DEFAULT 'kuest';
ALTER TABLE events ADD COLUMN IF NOT EXISTS polymarket_event_id TEXT;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_events_venue') THEN
    ALTER TABLE events ADD CONSTRAINT chk_events_venue CHECK (venue IN ('kuest', 'polymarket'));
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_polymarket_event_id
  ON events (polymarket_event_id) WHERE polymarket_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_venue ON events (venue) WHERE venue <> 'kuest';

-- What the admin chose to show. Nothing from Polymarket is visible unless a rule
-- includes it; the most specific rule wins (market > event > tag), and an
-- exclude beats an include at the same level.
--   scope 'tag'    ref = Gamma tag slug (parent_ref groups leagues under a sport)
--   scope 'event'  ref = Gamma event id
--   scope 'market' ref = Polymarket condition id
-- filters (tag rules): { maxEvents, minVolume, minLiquidity, windowDays, marketTypes[] }
CREATE TABLE IF NOT EXISTS polymarket_curation_rules (
  id          CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  scope       TEXT NOT NULL,
  ref         TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  parent_ref  TEXT,
  mode        TEXT NOT NULL DEFAULT 'include',
  pinned      BOOLEAN NOT NULL DEFAULT FALSE,
  filters     JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  updated_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_polymarket_curation_rules_scope_ref UNIQUE (scope, ref),
  CONSTRAINT chk_polymarket_curation_rules_scope CHECK (scope IN ('tag', 'event', 'market')),
  CONSTRAINT chk_polymarket_curation_rules_mode CHECK (mode IN ('include', 'exclude'))
);

CREATE OR REPLACE TRIGGER set_polymarket_curation_rules_updated_at
  BEFORE UPDATE ON polymarket_curation_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.polymarket_curation_rules ENABLE ROW LEVEL SECURITY;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'polymarket_curation_rules'
      AND policyname = 'service_role_all_polymarket_curation_rules'
  ) THEN
    CREATE POLICY service_role_all_polymarket_curation_rules ON public.polymarket_curation_rules
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$migration$;

-- "Notify me when trading opens" on Polymarket event pages (before trading is live).
CREATE TABLE IF NOT EXISTS polymarket_trading_interest (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id    CHAR(26) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id)
);

ALTER TABLE public.polymarket_trading_interest ENABLE ROW LEVEL SECURITY;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'polymarket_trading_interest'
      AND policyname = 'service_role_all_polymarket_trading_interest'
  ) THEN
    CREATE POLICY service_role_all_polymarket_trading_interest ON public.polymarket_trading_interest
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$migration$;

INSERT INTO public.subgraph_syncs (service_name, subgraph_name, status, total_processed, error_message, cursor_id)
VALUES ('polymarket_sync', 'gamma', 'idle', 0, NULL, NULL)
ON CONFLICT (service_name, subgraph_name) DO NOTHING;

-- Starting selection (owner, 2026-10-25). These are ordinary rules: the admin
-- page can switch any of them off. ON CONFLICT keeps an admin's later edits.
INSERT INTO polymarket_curation_rules (scope, ref, label, parent_ref, filters, sort_order) VALUES
  ('tag', 'epl', 'EPL', 'soccer', '{"maxEvents": 40, "marketTypes": ["moneyline", "spreads", "totals"]}', 10),
  ('tag', 'ucl', 'Champions League', 'soccer', '{"maxEvents": 30, "marketTypes": ["moneyline", "spreads", "totals"]}', 11),
  ('tag', 'la-liga', 'La Liga', 'soccer', '{"maxEvents": 30, "marketTypes": ["moneyline", "spreads", "totals"]}', 12),
  ('tag', 'afcon', 'AFCON', 'soccer', '{"maxEvents": 20, "marketTypes": ["moneyline", "spreads", "totals"]}', 13),
  ('tag', 'world-cup-qualifiers', 'World Cup Qualifiers', 'soccer', '{"maxEvents": 20, "marketTypes": ["moneyline", "spreads", "totals"]}', 14),
  ('tag', 'nba', 'NBA', 'basketball', '{"maxEvents": 40, "marketTypes": ["moneyline", "spreads", "totals"]}', 20),
  ('tag', 'crypto', 'Crypto', NULL, '{"maxEvents": 30, "minVolume": 50000}', 30),
  ('tag', 'finance', 'Finance', NULL, '{"maxEvents": 30, "minVolume": 50000}', 31),
  ('tag', 'tech', 'Tech', NULL, '{"maxEvents": 30, "minVolume": 50000}', 32),
  ('tag', 'politics', 'Politics', NULL, '{"maxEvents": 30, "minVolume": 100000}', 33)
ON CONFLICT (scope, ref) DO NOTHING;
