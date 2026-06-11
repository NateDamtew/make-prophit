-- Admin workflow fields for the waitlist. Lets the dashboard track who has been
-- invited, when, by whom, and keep free-text notes. Existing rows default to
-- 'pending'.
ALTER TABLE waitlists ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE waitlists ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;
ALTER TABLE waitlists ADD COLUMN IF NOT EXISTS invited_by TEXT;
ALTER TABLE waitlists ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS waitlists_status_idx ON waitlists (status);
CREATE INDEX IF NOT EXISTS waitlists_created_at_idx ON waitlists (created_at DESC);
