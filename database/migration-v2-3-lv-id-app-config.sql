-- LocalVision CMS v1.7.1: lv001 app-config fields

ALTER TABLE stores ADD COLUMN app_id TEXT DEFAULT '';
ALTER TABLE stores ADD COLUMN player_url TEXT DEFAULT '';
ALTER TABLE stores ADD COLUMN player_url_updated_at TEXT DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_app_id_unique
ON stores(app_id)
WHERE app_id IS NOT NULL AND app_id <> '';

-- 신규 기본 재생시간 20초. 기존 값이 비어 있거나 0 이하인 행만 보정합니다.
UPDATE contents
SET duration = 20
WHERE duration IS NULL OR duration = '' OR duration <= 0;
