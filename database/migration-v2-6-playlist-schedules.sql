-- LocalVision CMS v2.0.0 Schedule Playlist MVP migration
-- D1 콘솔에서 직접 실행해도 되고, CMS API ensureCoreSchema가 자동 보강해도 됩니다.

CREATE TABLE IF NOT EXISTS playlist_groups (
  id TEXT PRIMARY KEY,
  store TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  status TEXT DEFAULT '사용중',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store, slug)
);

CREATE TABLE IF NOT EXISTS playlist_schedules (
  id TEXT PRIMARY KEY,
  store TEXT NOT NULL,
  name TEXT NOT NULL,
  days_json TEXT DEFAULT '[1,2,3,4,5]',
  start_time TEXT DEFAULT '11:00',
  end_time TEXT DEFAULT '14:00',
  playlist_group_id TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 100,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE contents ADD COLUMN playlist_group_id TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_contents_playlist_group ON contents(store, side, playlist_group_id);
CREATE INDEX IF NOT EXISTS idx_playlist_groups_store ON playlist_groups(store, sort_order);
CREATE INDEX IF NOT EXISTS idx_playlist_schedules_store ON playlist_schedules(store, enabled, priority);
