/*
 * 通勤路線的縣市。
 *
 * 公車跟捷運不一樣：TDX 的公車資料是分縣市的，路線名要搭配城市才查得到
 * （「307」在台北與台中是完全不同的兩條線）。在這之前程式一律假設台北，
 * 那在台中、新北的使用者身上就是錯的 —— 而探索功能剛把台中納入範圍。
 *
 * 只有公車（含 mixed）需要它，捷運目前只接台北捷運，所以允許 NULL。
 * 值是 TDX 的城市代碼，對應 services/tdx.ts 的 BUS_CITIES。
 */
ALTER TABLE commute_routes ADD COLUMN IF NOT EXISTS city text;

/* 交通監看要用「這個縣市有哪些人在盯公車」來分組，沒有索引會全表掃描 */
CREATE INDEX IF NOT EXISTS commute_routes_city_idx
  ON commute_routes (city)
  WHERE city IS NOT NULL AND notification_enabled;
