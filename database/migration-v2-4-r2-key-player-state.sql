-- LocalVision CMS v2.4 R2 key + KST notice metadata + Player State API support
ALTER TABLE contents ADD COLUMN r2_key TEXT DEFAULT '';
ALTER TABLE notices ADD COLUMN r2_key TEXT DEFAULT '';
ALTER TABLE notices ADD COLUMN timezone TEXT DEFAULT 'Asia/Seoul';
ALTER TABLE notices ADD COLUMN repeat_interval_min INTEGER DEFAULT 0;
