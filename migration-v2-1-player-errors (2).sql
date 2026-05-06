-- LocalVision CMS D1 Schema v1.3

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT DEFAULT '',
  address TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  status TEXT DEFAULT '준비중',
  plan TEXT DEFAULT 'Local Basic',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contents (
  id TEXT PRIMARY KEY,
  store TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('left', 'right')),
  type TEXT NOT NULL CHECK (type IN ('image', 'video')),
  title TEXT NOT NULL,
  duration INTEGER DEFAULT 10,
  status TEXT DEFAULT '사용중',
  file_name TEXT DEFAULT '',
  url TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  store TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'tv',
  online INTEGER DEFAULT 0,
  last_seen TEXT DEFAULT '아직 접속 없음',
  app TEXT DEFAULT 'Player Web',
  device_code TEXT DEFAULT '',
  last_command TEXT DEFAULT '',
  command_at TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  target TEXT DEFAULT '',
  message TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO stores (id, name, slug, category, address, contact, status, plan, created_at)
VALUES
('st_001', '굽네치킨 고산점', 'goobne', '치킨 / 음식점', '의정부시 고산동', '010-0000-0000', '운영중', 'Local Basic', '2026-05-02'),
('st_002', '샛별플라워', 'sbflower', '꽃집', '의정부시 민락동', '010-0000-0000', '준비중', 'Local Basic', '2026-05-02'),
('st_003', '아름드리 카페', 'areumcafe', '카페', '의정부시 금오동', '010-0000-0000', '운영중', 'Public Board', '2026-05-02');

INSERT OR IGNORE INTO contents (id, store, side, type, title, duration, status, file_name, sort_order, updated_at)
VALUES
('ct_001', 'goobne', 'left', 'video', '대표메뉴 치킨 영상', 20, '사용중', 'left_1.mp4', 1, '2026-05-02'),
('ct_002', 'goobne', 'left', 'image', '점심세트 메뉴판', 10, '사용중', 'left_2.jpg', 2, '2026-05-02'),
('ct_003', '_common', 'right', 'image', '의정부 지역소식 카드', 12, '사용중', 'right_1.jpg', 1, '2026-05-01'),
('ct_004', '_common', 'right', 'video', 'LocalVision 공통 홍보', 15, '사용중', 'right_2.mp4', 2, '2026-05-01');

INSERT OR IGNORE INTO devices (id, store, name, role, online, last_seen, app, device_code, created_at)
VALUES
('dv_001', 'goobne', '굽네치킨 TV 1', 'tv', 1, '방금 전', 'Player Web', 'LV-GOOBNE-01', '2026-05-02'),
('dv_002', 'sbflower', '샛별플라워 TV 1', 'tv', 0, '37분 전', 'Fully Kiosk', 'LV-SBFLOWER-01', '2026-05-02'),
('dv_003', 'areumcafe', '아름드리 카페 TV 1', 'tv', 1, '1분 전', 'Android TV App', 'LV-AREUM-01', '2026-05-02');

-- Player error logs reported by LocalVision Player
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

-- Fullscreen notices per store
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
  repeat_mode TEXT DEFAULT 'always',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notices_store_active ON notices(store, is_active);
CREATE INDEX IF NOT EXISTS idx_notices_time ON notices(start_at, end_at);
