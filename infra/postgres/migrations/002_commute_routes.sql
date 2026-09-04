/*
 * 通勤路線。
 *
 * 001 的 favorite_stations 是以「站點」為單位的通知設定，沒有「路線」這個實體，
 * 所以一條路線只能拆成兩列存 —— 讀回來分不出哪列是起點，重複儲存也會一直長新列。
 * 這支 migration 補上路線本身，favorite_stations 維持它原本的角色（通知用的站點清單），
 * 由 repositories/commute.ts 在儲存路線時一併同步。
 *
 * 目前一個使用者只有一條通勤路線（設計稿的「每日通勤」），
 * 所以 user_ref_id 上直接下唯一索引，重新設定就是覆蓋。
 * 之後要支援多條（上班／回家／週末）時，把唯一索引改成 (user_ref_id, label)。
 */

CREATE TABLE IF NOT EXISTS commute_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_ref_id uuid NOT NULL REFERENCES external_user_refs(id) ON DELETE CASCADE,
  origin text NOT NULL,
  destination text NOT NULL,
  transport_mode text NOT NULL CHECK (transport_mode IN ('metro', 'bus', 'mixed')),
  -- 主要運具的路線名（例如「板南線」）。查不出來時為 NULL，畫面就不顯示即時狀態，
  -- 不要塞空字串假裝有值。
  line text,
  delay_threshold_minutes integer NOT NULL DEFAULT 5 CHECK (delay_threshold_minutes >= 0),
  notification_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS commute_routes_user_ref_key
  ON commute_routes (user_ref_id);

/*
 * favorite_stations 原本沒有唯一鍵，同一站重複儲存會不斷新增列。
 * 先清掉既有重複（保留最早的一列），再補上唯一鍵。
 */
DELETE FROM favorite_stations a
  USING favorite_stations b
 WHERE a.user_ref_id = b.user_ref_id
   AND a.station_id = b.station_id
   -- created_at 用 now()，同一筆交易裡插入的列時間完全相同，
   -- 所以要再拿 id 當決勝條件才排得出全序，否則重複列一個都刪不掉。
   AND (a.created_at, a.id) > (b.created_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS favorite_stations_user_station_key
  ON favorite_stations (user_ref_id, station_id);
