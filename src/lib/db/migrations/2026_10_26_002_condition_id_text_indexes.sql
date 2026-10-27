-- Fork: markets.condition_id is text while conditions.id and
-- outcomes.condition_id are character(66). Postgres compares the two as text,
-- so a join from markets (every event list's markets → condition → outcomes
-- lookup, and the raw markets/conditions/outcomes joins) cannot use the
-- character(66) indexes and scans the whole table once per market. On beta
-- that made a 12-event home list take 7-18 s in the database (1,421 scans of
-- conditions for the 12 largest events: 8.3 s, 500K buffer hits). Indexing the
-- text form lets those joins use an index lookup instead.
CREATE INDEX IF NOT EXISTS idx_conditions_id_text ON public.conditions ((id::text));
CREATE INDEX IF NOT EXISTS idx_outcomes_condition_id_text ON public.outcomes ((condition_id::text));
