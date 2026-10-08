-- FORK legacy catch-up: the 2026_09_15 baseline (003_create_auth_tables)
-- resolves Better Auth accounts by provider_id + account_id and drops the
-- issuer unique index added by 2026_08_28_001_account_issuer. Mirror that on
-- legacy installs so new accounts (issuer NULL) behave the same as on a fresh
-- database.
DROP INDEX IF EXISTS idx_accounts_issuer_account_id;
