-- 173: personal AI gateway entities: projects, provider enabled state, OAuth config, and project tracking dimensions.

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_states (
  provider TEXT PRIMARY KEY,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_oauth_configs (
  provider TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE combos ADD COLUMN project_id TEXT;
ALTER TABLE call_logs ADD COLUMN project_id TEXT;
ALTER TABLE usage_history ADD COLUMN project_id TEXT;
