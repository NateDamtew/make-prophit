-- Fork: age + Terms consent on the ledger profile, and a safer jury default.
--
-- Consent is recorded on the first deposit / stake / withdrawal (see
-- src/lib/mobile-money/consent.ts). `terms_version` lets a future Terms change
-- ask everyone again without a migration.
ALTER TABLE ledger_user_profiles ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE ledger_user_profiles ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ;
ALTER TABLE ledger_user_profiles ADD COLUMN IF NOT EXISTS terms_version TEXT;

-- Pool communities settle balances on the jury's word alone; new communities
-- start with three seats (enforced in src/lib/pools/jury.ts). Existing rows
-- are left as they are.
ALTER TABLE communities ALTER COLUMN jury_size SET DEFAULT 3;
