-- Fork: each user's Polymarket Deposit Wallet, remembered once they set up
-- Polymarket trading, so the portfolio can show their positions and balance
-- without asking for a signature. Public on-chain data; no funds live here.
CREATE TABLE IF NOT EXISTS polymarket_accounts (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  wallet_address  CHAR(42) NOT NULL,
  signer_address  CHAR(42) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER set_polymarket_accounts_updated_at
  BEFORE UPDATE ON polymarket_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.polymarket_accounts ENABLE ROW LEVEL SECURITY;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'polymarket_accounts'
      AND policyname = 'service_role_all_polymarket_accounts'
  ) THEN
    CREATE POLICY service_role_all_polymarket_accounts ON public.polymarket_accounts
      TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$migration$;
