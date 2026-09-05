/*
 * 補上 favorite_stations 的串聯刪除。
 *
 * 001 建這張表時外鍵沒寫 ON DELETE，所以預設是 NO ACTION：
 * 想刪掉一個 external_user_refs 就會被外鍵擋下來（實際踩到過）。
 * commute_routes（002）與 notifications（003）都是 CASCADE，
 * 只有這張不是 —— 三張表都掛在同一個使用者身上，行為必須一致，
 * 否則「刪除這個使用者的所有資料」永遠會失敗在這一張。
 */
ALTER TABLE favorite_stations
  DROP CONSTRAINT IF EXISTS favorite_stations_user_ref_id_fkey;

ALTER TABLE favorite_stations
  ADD CONSTRAINT favorite_stations_user_ref_id_fkey
  FOREIGN KEY (user_ref_id) REFERENCES external_user_refs(id) ON DELETE CASCADE;
