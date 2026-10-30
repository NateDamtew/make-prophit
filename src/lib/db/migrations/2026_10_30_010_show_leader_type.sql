-- Fork: Communities v1 — a "show" community type (TV and radio shows, each
-- episode asked about), next to creators. Widens the leader_type checks on
-- communities and community_applications.

ALTER TABLE communities DROP CONSTRAINT IF EXISTS chk_communities_leader_type;
ALTER TABLE communities ADD CONSTRAINT chk_communities_leader_type
  CHECK (leader_type IS NULL OR leader_type IN ('news', 'sports', 'creator', 'show', 'group', 'event'));

ALTER TABLE community_applications DROP CONSTRAINT IF EXISTS chk_community_applications_leader_type;
ALTER TABLE community_applications ADD CONSTRAINT chk_community_applications_leader_type
  CHECK (leader_type IN ('news', 'sports', 'creator', 'show', 'group', 'event'));
