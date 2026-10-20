-- Nightly reconciliation results for the local-currency ledger.
-- See LOCAL-PAYMENTS-DESIGN.md §12.

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id              CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  run_id          CHAR(26) NOT NULL,
  ran_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_name      TEXT NOT NULL,
  currency        CHAR(3),
  status          TEXT NOT NULL,
  expected        TEXT,
  actual          TEXT,
  delta           TEXT,
  details         JSONB,
  acknowledged_by CHAR(26),
  acknowledged_at TIMESTAMPTZ,
  note            TEXT,
  CONSTRAINT chk_reconciliation_runs_status CHECK (status IN ('ok', 'warn', 'fail', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_ran_at ON reconciliation_runs (ran_at);
CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_run ON reconciliation_runs (run_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_status ON reconciliation_runs (status, ran_at);

ALTER TABLE reconciliation_runs ENABLE ROW LEVEL SECURITY;
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reconciliation_runs' AND policyname = 'service_role_all_reconciliation_runs'
  ) THEN
    CREATE POLICY service_role_all_reconciliation_runs ON public.reconciliation_runs TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$migration$;
