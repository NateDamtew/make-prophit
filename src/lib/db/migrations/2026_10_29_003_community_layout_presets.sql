-- Communities v1 step 6: five home layouts (news, sports, creator, group,
-- event). The legacy values stay valid and map onto the new layouts at
-- render time (classic/newsroom -> news, forum -> group).
-- Additive; safe to re-run.

ALTER TABLE communities DROP CONSTRAINT IF EXISTS chk_communities_layout_preset;
ALTER TABLE communities
  ADD CONSTRAINT chk_communities_layout_preset
    CHECK (layout_preset IN ('classic', 'newsroom', 'news', 'sports', 'forum', 'group', 'creator', 'event'));
