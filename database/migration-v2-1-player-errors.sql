-- LocalVision CMS v2.1 Player Error Logs
CREATE TABLE IF NOT EXISTS player_errors (
  id TEXT PRIMARY KEY,
  store TEXT DEFAULT '',
  device_id TEXT DEFAULT '',
  error_code TEXT NOT NULL,
  level TEXT DEFAULT 'error',
  message TEXT NOT NULL,
  href TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  extra_json TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_player_errors_device_created ON player_errors(device_id, created_at);
CREATE INDEX IF NOT EXISTS idx_player_errors_store_created ON player_errors(store, created_at);
