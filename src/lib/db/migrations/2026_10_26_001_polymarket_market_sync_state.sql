-- Fork: what each imported Polymarket market looked like when the sync last
-- stored it, so runs skip markets whose data has not changed instead of
-- re-importing the whole catalogue every time.
CREATE TABLE IF NOT EXISTS polymarket_market_sync_state (
  condition_id  TEXT PRIMARY KEY REFERENCES conditions(id) ON DELETE CASCADE,
  fingerprint   TEXT NOT NULL,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.polymarket_market_sync_state ENABLE ROW LEVEL SECURITY;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'polymarket_market_sync_state'
      AND policyname = 'service_role_all_polymarket_market_sync_state'
  ) THEN
    CREATE POLICY service_role_all_polymarket_market_sync_state ON public.polymarket_market_sync_state
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$migration$;
