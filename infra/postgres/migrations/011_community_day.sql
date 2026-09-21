/*
 * 社群日。
 *
 * Task.md：「在特定社群日活動時主動發起『綠色共乘快線』」。
 *
 * ── 為什麼不用開新表 ──
 * 社群日就是**一場有明確時間窗的 campaign**，而 campaigns 從 001 就有
 * starts_at / ends_at 了。開一張 community_days 表只會讓「活動」這個概念
 * 有兩個來源，然後每個查詢都要 union 兩邊。
 *
 * ── 但時間窗不足以分辨它 ──
 * 「城市探索・台北」是常設的（沒有結束日），「寶可夢社群日」是週六下午三小時。
 * 光看有沒有 ends_at 可以猜，但猜錯的代價是把常設活動當成限時活動去推播。
 * 所以用一個明確的欄位講清楚意圖，不要讓讀取端靠推理。
 *
 *   standing      常設，隨時可以去
 *   community-day 限時活動，值得主動提醒、值得排一條路線一次跑完
 */

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'standing';

ALTER TABLE campaigns
  DROP CONSTRAINT IF EXISTS campaigns_kind_check;
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_kind_check CHECK (kind IN ('standing', 'community-day'));

/*
 * 「現在有沒有進行中的社群日」會被很頻繁地問（每次開探索頁）。
 * 部分索引只放限時活動 —— 常設活動永遠不會是這個查詢的答案，
 * 把它們放進索引只是讓索引變大。
 */
CREATE INDEX IF NOT EXISTS campaigns_community_day_idx
  ON campaigns (starts_at, ends_at)
  WHERE kind = 'community-day' AND status = 'active';
