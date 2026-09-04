/*
 * 通知。
 *
 * 分成兩張表，因為它們記的是不同的東西：
 *   transit_disruptions  世界上發生了什麼（001 就建好了，這裡補欄位）
 *   notifications        我們跟「某個人」說了什麼
 * 混成一張的話，同一起事件影響 100 個人就會變成 100 筆重複的事件資料，
 * 而且沒辦法回答「這則通知對應的是哪一起事件」。
 */

/*
 * transit_disruptions 原本假設每一起事件都屬於某一站，但 TDX 的捷運事件
 * 是以「路線」為單位通報的（Scope.Lines），常常整條線都受影響、沒有特定站。
 * 所以補上 line_id，並讓 station_id 可以是 NULL。
 */
ALTER TABLE transit_disruptions ADD COLUMN IF NOT EXISTS line_id text;
ALTER TABLE transit_disruptions ALTER COLUMN station_id DROP NOT NULL;

/*
 * 事件的文字內容。原本沒有這兩欄，但通知的標題與內文就是從這裡來的 ——
 * 沒有的話每次要顯示通知都得回頭再打一次 TDX。
 */
ALTER TABLE transit_disruptions ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE transit_disruptions ADD COLUMN IF NOT EXISTS description text;

/* 輪詢時要用「這條線最近有沒有事件」來比對，沒有索引會全表掃描 */
CREATE INDEX IF NOT EXISTS transit_disruptions_line_observed_idx
  ON transit_disruptions (line_id, observed_at DESC);

/*
 * 通勤時段。
 *
 * favorite_stations 從 001 就有這三個欄位，但那是「站」的設定；
 * 通知要判斷的是「這個人現在是不是在通勤」，那是路線的屬性，放這裡才對。
 *
 * 語意：
 *   usual_days 空陣列 = 每天都通勤（不是「都不通勤」）
 *   時間兩欄皆為 NULL = 沒有指定時段，交給程式的靜音時段判斷
 *   start > end 代表跨午夜，例如 22:00–02:00（大夜班）
 */
ALTER TABLE commute_routes
  ADD COLUMN IF NOT EXISTS usual_days text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS usual_time_start time,
  ADD COLUMN IF NOT EXISTS usual_time_end time;

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_ref_id uuid NOT NULL REFERENCES external_user_refs(id) ON DELETE CASCADE,
  -- 目前只有 'transit_disruption'，之後會有天氣、任務等等
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  -- 點下去要去哪，例如 /ride/estimate?from=板橋&to=市政府。
  -- 通知的價值不在告知，在於接下來能做什麼，所以動作是一等公民。
  action_route text,
  action_label text,
  -- 來源事件。provider + external_event_id 是外部世界的身分，
  -- disruption_id 指向我們自己的紀錄（事件更新時會換一列，所以可能落後）。
  provider text,
  external_event_id text,
  disruption_id uuid REFERENCES transit_disruptions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

/*
 * 同一件事不要煩同一個人兩次。
 * 輪詢每兩分鐘跑一次，同一起事件會被撈到幾十次，沒有這個唯一鍵就是灌爆收件匣。
 * 事件內容有更新時是 UPDATE 既有那列，不是新增一列。
 */
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_event_key
  ON notifications (user_ref_id, provider, external_event_id)
  WHERE provider IS NOT NULL AND external_event_id IS NOT NULL;

/* 收件匣一律「某個人的、最新的在前」，這是唯一的查詢形態 */
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications (user_ref_id, created_at DESC);
