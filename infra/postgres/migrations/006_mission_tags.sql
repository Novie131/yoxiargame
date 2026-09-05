/*
 * 任務的興趣標籤。
 *
 * 探索頁的興趣 chips 從實作出來就只是本地 state —— 按了不影響任何東西，
 * 因為 missions 沒有可以比對的欄位。這支補上。
 *
 * 值用探索頁 chips 的 id（food、photo、sport…），兩邊必須一致，
 * 否則篩選會靜默地永遠篩不到東西。
 *
 * 刻意用陣列而不是關聯表：標籤是少量、扁平、只做「有沒有交集」的查詢，
 * 開一張 mission_tags 表只會讓每次查詢多一次 join，換不到任何東西。
 */
ALTER TABLE missions ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

/* 陣列交集查詢（tags && $1）要 GIN 索引才不會退化成全表掃描 */
CREATE INDEX IF NOT EXISTS missions_tags_gin ON missions USING gin(tags);
