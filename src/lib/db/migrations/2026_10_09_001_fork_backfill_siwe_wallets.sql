-- FORK: better-auth 1.7's SIWE plugin resolves returning users only through the
-- `wallets` table (by address + chain, then by address alone). The pre-1.7 fork
-- matched on `users.address` and never wrote `wallets` rows, so every existing
-- wallet user fell through to createUser and hit the users_address_key unique
-- constraint ("Failed query: insert into users ...") — nobody could sign back in.
-- Give each such user the wallet row the plugin expects. Idempotent.
INSERT INTO public.wallets (user_id, address, chain_id, is_primary, created_at)
SELECT u.id, u.address, 137, true, u.created_at
FROM public.users u
WHERE u.address IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.wallets w
    WHERE w.user_id = u.id OR lower(w.address) = lower(u.address)
  );
