-- Signing up is the age + Terms acceptance ("By signing up you agree to the
-- Terms"). New ledger profiles are seeded with the acceptance in code; this
-- backfills every profile created before that, so nobody is asked twice.
UPDATE ledger_user_profiles
SET
  terms_accepted_at = COALESCE(terms_accepted_at, created_at),
  age_confirmed_at = COALESCE(age_confirmed_at, created_at),
  terms_version = COALESCE(terms_version, '2026-10-21'),
  updated_at = now()
WHERE terms_accepted_at IS NULL
   OR age_confirmed_at IS NULL
   OR terms_version IS NULL;
