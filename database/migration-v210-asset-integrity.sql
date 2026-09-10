-- Optional: normally created on first integrity write. Non-destructive.
CREATE TABLE IF NOT EXISTS asset_integrity (content_id TEXT PRIMARY KEY, url TEXT NOT NULL, manifest_json TEXT NOT NULL, updated_at TEXT NOT NULL);
