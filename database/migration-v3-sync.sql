-- LocalVision v3.0.0: core schema first; no table wipe.
CREATE TABLE IF NOT EXISTS asset_integrity (content_id TEXT PRIMARY KEY, url TEXT NOT NULL, manifest_json TEXT NOT NULL, updated_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS lv_publications (store TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, published INTEGER NOT NULL DEFAULT 0, object_key TEXT NOT NULL DEFAULT '', command_json TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '');

CREATE TABLE IF NOT EXISTS lv_tombstones (asset_id TEXT PRIMARY KEY, asset_version TEXT NOT NULL DEFAULT '*', store TEXT NOT NULL DEFAULT '', side TEXT NOT NULL DEFAULT '', r2_key TEXT NOT NULL DEFAULT '', deleted_at TEXT NOT NULL DEFAULT '');

CREATE TABLE IF NOT EXISTS lv_runtime (installation TEXT PRIMARY KEY, store TEXT NOT NULL, generation INTEGER NOT NULL, boot TEXT NOT NULL, seq INTEGER NOT NULL DEFAULT 0, state_revision INTEGER NOT NULL DEFAULT 0, normal_at INTEGER NOT NULL DEFAULT 0, received_at INTEGER NOT NULL DEFAULT 0, signature TEXT NOT NULL DEFAULT '', summary_json TEXT NOT NULL DEFAULT '{}', budget_day TEXT NOT NULL DEFAULT '', important_count INTEGER NOT NULL DEFAULT 0, sample_count INTEGER NOT NULL DEFAULT 0, fault_seen INTEGER NOT NULL DEFAULT 0, fault_total INTEGER NOT NULL DEFAULT 0);

CREATE INDEX IF NOT EXISTS idx_lv_runtime_store ON lv_runtime(store);

CREATE TABLE IF NOT EXISTS lv_error_samples (id TEXT PRIMARY KEY, installation TEXT NOT NULL, created_at INTEGER NOT NULL, payload_json TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS idx_lv_samples_time ON lv_error_samples(created_at);

CREATE TABLE IF NOT EXISTS lv_storage (id INTEGER PRIMARY KEY CHECK(id=1), bytes INTEGER NOT NULL DEFAULT 0, reserved INTEGER NOT NULL DEFAULT 0, measured_at INTEGER NOT NULL DEFAULT 0, cursor TEXT NOT NULL DEFAULT '', scan_bytes INTEGER NOT NULL DEFAULT 0);

INSERT OR IGNORE INTO lv_storage(id) VALUES(1);

CREATE TABLE IF NOT EXISTS lv_uploads (id TEXT PRIMARY KEY, object_key TEXT NOT NULL, upload_id TEXT NOT NULL DEFAULT '', byte_size INTEGER NOT NULL, expires_at INTEGER NOT NULL, payload_json TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'reserved');

CREATE TABLE IF NOT EXISTS lv_objects (object_key TEXT PRIMARY KEY, byte_size INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL DEFAULT 'media');

CREATE UNIQUE INDEX IF NOT EXISTS idx_lv_upload_reserved_key ON lv_uploads(object_key) WHERE state='reserved';

CREATE TABLE IF NOT EXISTS lv_control(id INTEGER PRIMARY KEY CHECK(id=1), publishing_paused INTEGER NOT NULL DEFAULT 0);

INSERT OR IGNORE INTO lv_control(id) VALUES(1);

INSERT OR IGNORE INTO lv_publications(store) VALUES('_common');

INSERT OR IGNORE INTO lv_publications(store) SELECT slug FROM stores WHERE slug<>'';

CREATE TRIGGER IF NOT EXISTS lv_content_insert AFTER INSERT ON contents BEGIN INSERT INTO lv_publications(store,revision) VALUES(CASE WHEN NEW.side='right' THEN '_common' ELSE NEW.store END,1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_content_update AFTER UPDATE ON contents BEGIN INSERT INTO lv_publications(store,revision) VALUES(CASE WHEN NEW.side='right' THEN '_common' ELSE NEW.store END,1) ON CONFLICT(store) DO UPDATE SET revision=revision+1;INSERT INTO lv_publications(store,revision) VALUES(CASE WHEN OLD.side='right' THEN '_common' ELSE OLD.store END,1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_content_delete AFTER DELETE ON contents BEGIN INSERT INTO lv_publications(store,revision) VALUES(CASE WHEN OLD.side='right' THEN '_common' ELSE OLD.store END,1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_content_tombstone BEFORE DELETE ON contents BEGIN INSERT OR IGNORE INTO lv_tombstones(asset_id,store,side,r2_key,deleted_at) VALUES(OLD.id,OLD.store,OLD.side,OLD.r2_key,strftime('%Y-%m-%dT%H:%M:%fZ','now')); INSERT INTO lv_publications(store,revision) VALUES('_common',1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_content_no_resurrection BEFORE INSERT ON contents WHEN EXISTS(SELECT 1 FROM lv_tombstones WHERE asset_id=NEW.id) BEGIN SELECT RAISE(ABORT,'LV_DELETED_ASSET: use a new content id'); END;

CREATE TRIGGER IF NOT EXISTS lv_playlist_groups_insert AFTER INSERT ON playlist_groups BEGIN INSERT INTO lv_publications(store,revision) VALUES(NEW.store,1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_playlist_groups_update AFTER UPDATE ON playlist_groups BEGIN INSERT INTO lv_publications(store,revision) VALUES(NEW.store,1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_playlist_groups_delete AFTER DELETE ON playlist_groups BEGIN INSERT INTO lv_publications(store,revision) VALUES(OLD.store,1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_playlist_schedules_insert AFTER INSERT ON playlist_schedules BEGIN INSERT INTO lv_publications(store,revision) VALUES(NEW.store,1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_playlist_schedules_update AFTER UPDATE ON playlist_schedules BEGIN INSERT INTO lv_publications(store,revision) VALUES(NEW.store,1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_playlist_schedules_delete AFTER DELETE ON playlist_schedules BEGIN INSERT INTO lv_publications(store,revision) VALUES(OLD.store,1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_black_modes_insert AFTER INSERT ON black_modes BEGIN INSERT INTO lv_publications(store,revision) VALUES(NEW.store,1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_black_modes_update AFTER UPDATE ON black_modes BEGIN INSERT INTO lv_publications(store,revision) VALUES(NEW.store,1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_black_modes_delete AFTER DELETE ON black_modes BEGIN INSERT INTO lv_publications(store,revision) VALUES(OLD.store,1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_stores_insert AFTER INSERT ON stores BEGIN INSERT INTO lv_publications(store,revision) VALUES(NEW.slug,1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_stores_update AFTER UPDATE ON stores BEGIN INSERT INTO lv_publications(store,revision) VALUES(NEW.slug,1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_stores_delete AFTER DELETE ON stores BEGIN INSERT INTO lv_publications(store,revision) VALUES(OLD.slug,1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_notices_insert AFTER INSERT ON notices BEGIN INSERT INTO lv_publications(store,revision) VALUES('_common',1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_notices_update AFTER UPDATE ON notices BEGIN INSERT INTO lv_publications(store,revision) VALUES('_common',1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_notices_delete AFTER DELETE ON notices BEGIN INSERT INTO lv_publications(store,revision) VALUES('_common',1) ON CONFLICT(store) DO UPDATE SET revision=revision+1; END;

CREATE TRIGGER IF NOT EXISTS lv_device_command AFTER UPDATE OF last_command,command_at ON devices WHEN NEW.last_command<>COALESCE(OLD.last_command,'') OR NEW.command_at<>COALESCE(OLD.command_at,'') BEGIN INSERT INTO lv_publications(store,command_json) VALUES(NEW.store,json_object('command',NEW.last_command,'commandAt',NEW.command_at,'deviceId',NEW.id)) ON CONFLICT(store) DO UPDATE SET command_json=json_object('command',NEW.last_command,'commandAt',NEW.command_at,'deviceId',NEW.id); END;
