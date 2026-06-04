-- ─── Agents ─────────────────────────────────────────────────────────────────
-- AI agents registered by users. Each agent has its own identity (name, avatar,
-- bio, public profile), API key (hashed) for read/trade access, and per-agent
-- spending limits that gate how much of the owner's wallet it can spend.
--
-- Trading actually goes live with Kuest mainnet. Schema is built now so the
-- registration/leaderboard UI is real, and we don't need to migrate later when
-- agent trading switches on.

CREATE TABLE IF NOT EXISTS agents (
  id                CHAR(26) PRIMARY KEY DEFAULT generate_ulid(),
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  description       TEXT,
  avatar_url        TEXT,

  -- Authentication: only the hash + a display prefix are stored. The raw key
  -- is shown to the owner exactly once at creation/rotation.
  api_key_hash      TEXT NOT NULL,
  api_key_prefix    TEXT NOT NULL,

  -- Capability scopes. Always includes 'read'; 'trade' is gated behind mainnet.
  scopes            TEXT[] NOT NULL DEFAULT ARRAY['read']::TEXT[],

  -- Lifecycle.
  status            TEXT NOT NULL DEFAULT 'active',
  is_public         BOOLEAN NOT NULL DEFAULT true,

  -- Owner-set spending controls. NULL = no limit at this layer (still capped
  -- by wallet balance). Values are in USD micro-units alignment is via numeric.
  daily_limit_usd   NUMERIC(20, 6),
  total_limit_usd   NUMERIC(20, 6),
  daily_spent_usd   NUMERIC(20, 6) NOT NULL DEFAULT 0,
  total_spent_usd   NUMERIC(20, 6) NOT NULL DEFAULT 0,
  last_spent_reset  DATE,

  -- Denormalized leaderboard stats (updated when trades settle).
  total_volume_usd  NUMERIC(20, 6) NOT NULL DEFAULT 0,
  total_pnl_usd     NUMERIC(20, 6) NOT NULL DEFAULT 0,
  total_trades      INTEGER NOT NULL DEFAULT 0,
  win_count         INTEGER NOT NULL DEFAULT 0,

  -- Timestamps.
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at    TIMESTAMPTZ,

  CONSTRAINT chk_agents_status CHECK (status IN ('active', 'paused', 'revoked')),
  CONSTRAINT chk_agents_daily_limit_nonneg CHECK (daily_limit_usd IS NULL OR daily_limit_usd >= 0),
  CONSTRAINT chk_agents_total_limit_nonneg CHECK (total_limit_usd IS NULL OR total_limit_usd >= 0)
);

CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_total_pnl_usd ON agents(total_pnl_usd DESC) WHERE status = 'active' AND is_public = true;
CREATE INDEX IF NOT EXISTS idx_agents_total_volume_usd ON agents(total_volume_usd DESC) WHERE status = 'active' AND is_public = true;

-- Keep updated_at in sync without app-level work.
CREATE OR REPLACE FUNCTION agents_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agents_updated_at ON agents;
CREATE TRIGGER trg_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION agents_set_updated_at();
