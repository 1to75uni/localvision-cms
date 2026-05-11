-- LocalVision CMS v1.8.6 right content target stores
-- 기존 right 콘텐츠는 target_mode가 없거나 all이면 모든 매장에 계속 노출됩니다.
ALTER TABLE contents ADD COLUMN target_mode TEXT DEFAULT 'all';
ALTER TABLE contents ADD COLUMN target_stores_json TEXT DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_contents_right_target ON contents(side, target_mode);
UPDATE contents SET target_mode = 'all' WHERE target_mode IS NULL OR target_mode = '';
UPDATE contents SET target_stores_json = '[]' WHERE target_stores_json IS NULL OR target_stores_json = '';
