/*
 * 玩家的任務進度。
 *
 * missions 從 001 就在了，但它只描述「世界上有哪些任務」，
 * 沒有任何地方記得「誰做了什麼」—— 所以整套任務系統目前是唯讀的：
 * 看得到、走得到、比較得出怎麼去，但完成不了。
 *
 * 這張表補上那一半。它是遊戲層唯一真正缺的 schema，其餘（地點、半徑、
 * 時間窗、標籤、活動）missions 與 campaigns 已經都有了。
 *
 * ── 為什麼 status 是三個值而不是一個布林 ──
 * 打卡只需要 completed，但遊戲不會只有打卡。先把狀態機留出來，
 * 之後加「已看過」「進行中」不用再動一次 schema 與所有讀取端：
 *   seen      出現在他的地圖上、他點開過
 *   started   已開始但還沒完成（多階段任務用）
 *   completed 完成
 *
 * progress 用 jsonb 而不是開欄位：不同型態的任務要記的東西完全不一樣
 * （打卡只要時間、收集要數量、對戰要分數）。這是遊戲團隊自己的地盤，
 * 我們不要預先替他們決定欄位。
 *
 * ── 主鍵就是 (user, mission) ──
 * 同一個人對同一個任務只有一列。打卡重複送出是冪等的，不會長出第二列，
 * 也不需要另外做去重 —— 手機網路不穩時重送是常態。
 */

CREATE TABLE IF NOT EXISTS user_missions (
  user_ref_id uuid NOT NULL REFERENCES external_user_refs(id) ON DELETE CASCADE,
  mission_id  uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  status      text NOT NULL CHECK (status IN ('seen', 'started', 'completed')),
  progress    jsonb NOT NULL DEFAULT '{}'::jsonb,
  /*
   * 完成當下的座標。
   *
   * 記下來不是為了防作弊（前端傳來的座標本來就可以偽造），
   * 而是為了**事後查得出問題**：某個任務所有人都在 300 公尺外完成，
   * 那多半是圍欄半徑設錯或地點座標標錯，不是大家都在作弊。
   * 沒有這兩欄就只能猜。
   */
  completed_lat double precision,
  completed_lon double precision,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_ref_id, mission_id)
);

/*
 * 「這個人完成了哪些」要照時間倒序列出（會員頁、成就頁）。
 * 主鍵的順序是 (user, mission)，排不了時間，所以另外補一支。
 */
CREATE INDEX IF NOT EXISTS user_missions_user_completed_idx
  ON user_missions (user_ref_id, completed_at DESC)
  WHERE status = 'completed';

/*
 * 反向查「這個任務有多少人完成」——活動成效要看這個。
 * 只索引 completed：seen 的量會比 completed 大一兩個數量級，
 * 把它們一起索引只是讓索引變大而查詢沒變快。
 */
CREATE INDEX IF NOT EXISTS user_missions_mission_idx
  ON user_missions (mission_id)
  WHERE status = 'completed';
