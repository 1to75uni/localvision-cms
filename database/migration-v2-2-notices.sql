-- LocalVision CMS v2.2 Fullscreen Notices
CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY,
  store TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('image', 'video', 'link', 'text')),
  message TEXT DEFAULT '',
  media_url TEXT DEFAULT '',
  link_url TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  start_at TEXT DEFAULT '',
  end_at TEXT DEFAULT '',
  display_mode TEXT DEFAULT 'fullscreen',
  priority TEXT DEFAULT 'normal',
  duration_sec INTEGER DEFAULT 15,
  repeat_mode TEXT DEFAULT 'once',
  repeat_interval_min INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notices_store_active ON notices(store, is_active);
CREATE INDEX IF NOT EXISTS idx_notices_time ON notices(start_at, end_at);
