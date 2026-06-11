-- Admin dashboard audit trail. Every mutating admin action records a row here
-- so the Overview activity feed and future audit viewer have a single source.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  actor_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  summary TEXT,
  diff JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx
  ON admin_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx
  ON admin_audit_log (target_type, target_id);
