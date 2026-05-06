CREATE TABLE IF NOT EXISTS device_screenshots (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  store TEXT DEFAULT '',
  url TEXT NOT NULL,
  r2_key TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_device_screenshots_device_created
ON device_screenshots(device_id, created_at);
