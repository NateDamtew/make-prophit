-- Enable Row Level Security on the fork-only tables.
--
-- Upstream enables RLS on every table it creates (and their
-- tests/unit/migrationRls.test.ts enforces it). The fork's own tables —
-- communities, agents, waitlists and the admin audit log — were created
-- without it, so they were reachable through Supabase's anon/authenticated
-- PostgREST roles even though the app itself connects over POSTGRES_URL.
--
-- No policies are added, matching upstream's convention: the table owner /
-- service role that the app connects as bypasses RLS, while the public
-- PostgREST roles are left with no policy and therefore no access.

ALTER TABLE IF EXISTS communities
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS community_members
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS community_markets
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS jury_votes
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS community_reviews
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS community_invites
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agents
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS waitlists
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS admin_audit_log
  ENABLE ROW LEVEL SECURITY;
