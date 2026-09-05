/*
 * 反向導流所需的兩件事。
 *
 * 目標是「活動主動找上使用者」，而不是等使用者打開 App 滑地圖。
 * 這需要後端能自己回答兩個問題：這個人對什麼有興趣、他每天會出現在哪裡。
 * 兩個答案目前都不在資料庫裡 —— 興趣只存在瀏覽器的 localStorage，
 * 通勤路線只有站名沒有座標。
 */

/*
 * 通勤起訖站的座標。
 *
 * 有了它，「找出通勤路線附近的任務」就是一句 PostGIS 查詢，吃現成的空間索引；
 * 沒有它就得對每個使用者各查一次站點座標再算距離，那是 N 次往返。
 *
 * 只有捷運站查得到座標（公車站牌沒有站表），所以允許 NULL —— 查不到就代表
 * 這條路線不參與地點推薦，不要用一個猜的座標去比對。
 */
ALTER TABLE commute_routes
  ADD COLUMN IF NOT EXISTS origin_lat double precision,
  ADD COLUMN IF NOT EXISTS origin_lon double precision,
  ADD COLUMN IF NOT EXISTS destination_lat double precision,
  ADD COLUMN IF NOT EXISTS destination_lon double precision;

/*
 * 使用者偏好。
 *
 * 刻意獨立成一張表而不是加在 external_user_refs 上 ——
 * 那張表是身分對應，把偏好塞進去會讓「這個人是誰」跟「這個人喜歡什麼」
 * 混在一起，之後接真正的登入時很難拆。
 *
 * interests 的值與探索頁的 chips id 一致（food、coffee、sport…）。
 */
CREATE TABLE IF NOT EXISTS user_preferences (
  user_ref_id uuid PRIMARY KEY REFERENCES external_user_refs(id) ON DELETE CASCADE,
  interests text[] NOT NULL DEFAULT '{}',
  /* 關掉就完全不會收到地點推薦，跟交通異常的開關分開 */
  discovery_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_preferences_interests_gin
  ON user_preferences USING gin(interests);
