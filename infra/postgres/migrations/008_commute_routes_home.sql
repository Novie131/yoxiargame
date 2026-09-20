/*
 * 回家那條路線，以及「幾點要到」。
 *
 * 兩件事放在同一支是因為它們動的是同一張表，而且都是為了同一個缺口：
 * 目前的通勤設定只描述得出「早上那一趟」。
 *
 * ── 為什麼要第二條路線 ──
 * 002 在 user_ref_id 上下唯一索引，一人只能存一條。使用者存的是
 * 「板橋 → 市政府」（上班），於是異常通知只保護早上那一段。
 * 但晚上才是叫車需求的高峰、末班車問題唯一會發生的時段、
 * 以及使用者最沒耐心查路線的時候 —— 我們保護了比較不需要保護的那一段。
 *
 * 回程也不是去程的反向：末班車分方向、路線可能不同（避開轉乘、走不同出口）、
 * 尖峰離峰的班距完全不同。所以它必須是獨立的一列，不能由去程推。
 *
 * ── 為什麼 label 是固定值而不是讓使用者命名 ──
 * 自由命名會變成一個沒人填的欄位，然後我們得處理空字串、重複名稱、
 * 以及「哪一條才是上班那條」這種答不出來的問題。
 * 固定兩個值就夠：commute（上班）、home（回家）。
 * 兩條解決 90% 的情況，更多就變成行程管理了，那是另一個產品。
 */

/*
 * 既有資料一律當成上班那條。
 *
 * 先給 DEFAULT 再補 NOT NULL，既有列才不會在加欄位的瞬間違反約束。
 */
ALTER TABLE commute_routes
  ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT 'commute';

ALTER TABLE commute_routes
  DROP CONSTRAINT IF EXISTS commute_routes_label_check;
ALTER TABLE commute_routes
  ADD CONSTRAINT commute_routes_label_check CHECK (label IN ('commute', 'home'));

/*
 * 換索引的順序：先建新的，再刪舊的。
 *
 * 反過來的話，兩個動作之間這張表是沒有唯一約束的，
 * 而這支 migration 跑的時候服務仍然在收請求。
 */
CREATE UNIQUE INDEX IF NOT EXISTS commute_routes_user_label_key
  ON commute_routes (user_ref_id, label);

DROP INDEX IF EXISTS commute_routes_user_ref_key;

/*
 * 幾點要到。
 *
 * README 記過這件事：設計稿的行程卡寫「建議 08:05 出發」，但反推出發時間
 * 需要知道使用者幾點要到，而通勤設定沒收集那個欄位，所以當時改成從現在正推
 * （「現在出發約 N 分鐘」）。那個折衷是對的，但它把一個功能降級成了資訊顯示。
 *
 * ── 為什麼不沿用 usual_time_end ──
 * 語意不一樣，混用會讓兩個功能互相破壞：
 *   usual_time_start / usual_time_end  「這個時段內發生的異常才通知我」
 *   arrive_by                          「我幾點要到目的地」
 * 有人設 07:00–21:00 的通知時段，那不代表他 21:00 要到公司。
 * 硬要沿用的話，改通知時段會默默改掉出發倒數，而使用者完全看不出因果。
 *
 * NULL = 沒設定，行程頁就退回「現在出發約 N 分鐘」的顯示，不要猜一個時間。
 */
ALTER TABLE commute_routes
  ADD COLUMN IF NOT EXISTS arrive_by time;
