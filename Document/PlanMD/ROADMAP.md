# ROADMAP

最後更新：2026-09-17（依實際程式碼重新盤點；上一版停在 09-02，期間完成的項目未反映）

目標：從「視覺原型」長成正式產品。
原型階段是 UI 先行、資料造假；正式階段相反 —— 先打通資料層。

---

> 提案中、還沒排進這份 ROADMAP 的功能想法，見同資料夾的 `FEATURES.md`。
> 決定要做的就從那裡搬過來。

## 下一步：建議的優先序

**B5 → B6 → B7**，理由是依賴關係而不是重要性：

1. **B5 Workers 的資料庫連線** —— 現在線上部署沒有資料庫，探索頁的任務標記、
   通勤路線、通知、排程監看在正式環境全是空的。不修這個，後面做什麼都只有本機看得到。
   **程式碼已於 09-17 改完（Hyperdrive），只剩開一台雲端 Postgres 並填 id。**
2. ~~**B6 叫車接真**~~ —— **09-17 已做到可 demo**：估價改用臺北市公告費率實算，
   四頁串成同一趟，四個入口都通。yoxi 的實際報價與派車仍卡在合作談判。
3. **B7 登入** —— 所有個人化功能的前提，但在 B5 之前做沒有意義（沒有資料庫可以存帳號）。

---

## 已完成

### 階段 0-4：原型（08-30 ~ 08-31）

- 技術選型：Expo → **Capacitor**（雙平台需求）
- `apps/mobile` 骨架：Vite + React + TypeScript + Tailwind + React Router
- `Document/` 35 張設計稿改名、建索引、取樣色票
- 11 個畫面實作完成（見 `Document/README.md`）
- `apps/api` 骨架：Hono + Vercel AI SDK v7，provider 可切換

**產出**：一條可走的流程 —— 下雨情境 → 立即叫車 → 預估車資 → 確認叫車 → 司機前往中 → 行程進行中。

### B1：資料層（09-02 完成）

| 項目 | 狀態 |
|---|---|
| 容器執行環境 | ✓ Colima 0.10.3（**不用 Docker Desktop**） |
| Postgres + PostGIS | ✓ PostGIS 3.6.4、pgcrypto 1.3 |
| Redis | ✓ 7-alpine |
| DB 連線層 | ✓ `apps/api/src/db/client.ts` |
| migration 執行機制 | ✓ 已驗證冪等，7 支已套用 |
| repository 層 | ✓ `commute` / `missions` / `notifications` / `preferences` |

**資料表**：`analytics_events`、`campaigns`、`commute_routes`、`external_user_refs`、
`favorite_stations`、`idempotency_records`、`missions`、`notifications`、
`transit_disruptions`、`user_preferences`（外加 `schema_migrations`）。
`missions_location_gix`（GiST）與 `missions_tags_gin` 已建立。

**環境安裝腳本**：`/Users/imacuser/tse/ensure-docker.sh`（在 repo 之外，不進版控）

### B2-B4：09-03 ~ 09-09 完成的部分

上一版把這些列在「待辦」，現在都已經上線：

| 項目 | 落地位置 |
|---|---|
| **真實地圖** | MapLibre + OpenStreetMap 圖磚。`components/Map.tsx`，叫車四頁的底圖 `MapBackdrop` 也換掉了，可拖曳縮放 |
| **天氣** | `services/weather.ts`，接 **Open-Meteo**（不是中央氣象署 —— 免申請、免金鑰，分級沿用氣象署慣例）。含 8 小時逐時預報、帶傘與體感穿著建議 |
| **捷運／公車即時狀態** | `services/tdx.ts`，TDX 已串接。`/transit/metro`、`/transit/bus` |
| **路徑規劃** | `services/route-planner.ts`，Yen's K-Shortest Loopless Paths + Dijkstra，回建議路線與備選（備選會濾掉 Pareto 支配的路） |
| **首末班車與班距** | `services/metro-schedule.ts`，收班後不再回「三分鐘會到」，等車時間用 TDX 真實班距而非寫死的 120 秒 |
| **地名轉座標** | `/geocode`，站名比對會把「臺」摺成「台」 |
| **常用路線** | `commute_routes`，模型在使用者明確宣告日常通勤時自動存 |
| **今天的行程** | 前端 localStorage（`lib/trips.ts`），與常用路線刻意分流 |
| **交通監看與通知** | `services/transit-watch.ts` + 通知收件匣畫面，內容全部來自真實事件，沒有示範資料 |
| **探索頁任務** | `missions` 的 PostGIS 空間查詢，地圖標記非寫死 |
| **設定頁、會員頁** | 提案版（無設計稿），開關只在真的會改變行為時才能按 |
| **語音輸入** | `lib/speech.ts` |
| **部署** | 前端 Cloudflare Pages（`yoxiargame.pages.dev`），後端 Cloudflare Workers，CORS 已鎖定 |

**LLM 實測結果**（`npm run lang-check`，各 6 個案例）

| | nemotron-3-super-120b | nemotron-3.5-lightning-30b |
|---|---|---|
| 成功率 | 4 / 6 | 6 / 6 |
| 503 次數 | 9 | 0 |
| 繁中／台灣用語問題 | 0 | 0 |
| 首字延遲 | 3517 ms | 3211 ms |
| 總延遲中位數 | 3596 ms | 9241 ms |

結論：主模型用 super（快），備援用 lightning（穩），已實作自動 fallback。
繁體中文與台灣用語兩個模型都零缺失，原先擔心的中國用語問題未發生。

---

## 待辦

### B5：Workers 的資料庫連線 —— 程式碼已完成，等開服務

**問題**：`pg` 需要 TCP，Cloudflare Workers 不支援。所以線上部署的
`DATABASE_URL` 是空的，`hasDatabase()` 回 false，以下功能在正式環境**靜默失效**：

- `/missions/nearby` —— 探索頁地圖上沒有任何任務標記
- 通勤路線的儲存與讀取
- 通知收件匣（永遠是空的）
- `wrangler.toml` 的 cron（每 2 分鐘）→ `worker.ts` 的 `scheduled()` 直接 no-op

本機 Node 部署（`src/index.ts`）一切正常，所以這個差異很容易被忽略。

**選定方案：Cloudflare Hyperdrive**。它在邊緣代理連線並自己做連線池，Worker 端
照舊用 `pg` —— 跟 Node 部署共用同一套程式碼，不像 HTTP driver 要改查詢介面。

**已完成（09-17）**

| 改動 | 位置 |
|---|---|
| 連線字串多一個來源，Hyperdrive 優先於 `DATABASE_URL` | `db/client.ts` 的 `useHyperdrive()` |
| Workers 上連線池上限調成 5（Hyperdrive 已經在邊緣做池了） | `db/client.ts` |
| 把綁定接進來 —— 它是資源綁定不是環境變數，原本的 `applyEnv` 迴圈會跳過 | `worker.ts` |
| 設定步驟與綁定區塊（先註解著） | `wrangler.toml` |
| 略過原因的字串從「未設定 DATABASE_URL」改成「沒有資料庫連線」 | `transit-watch.ts`、`mission-watch.ts` |

`wrangler deploy --dry-run` 通過，綁定清單與改動前一致 —— 在下面三步做完之前，
線上行為完全不變。

**剩下的三步（需要開帳號，程式碼不用再動）**

1. 開一台公開連得到的 Postgres，**必須能裝 PostGIS**（`missions` 的地理查詢靠它）。
   目前 `infra/compose` 那台跑在本機 Colima 裡，Hyperdrive 連不到。
2. 從本機指著雲端那台跑 migration —— `migrate.ts` 讀檔案系統，不能在 Workers 上跑：
   `DATABASE_URL='postgres://...' npm run db:migrate`
3. `npx wrangler hyperdrive create yoxi-db --connection-string='postgres://...'`，
   把回傳的 id 填進 `wrangler.toml` 並取消那三行的註解，然後 `cf:deploy`。

### B6：叫車流程 —— 已可完整 demo，估價尚非 yoxi 報價

**09-17 完成**。原本四頁各自把設計稿的數字寫死、頁與頁之間毫無關係
（從探索頁帶著「大安森林公園」進來，估價頁照樣顯示松山機場的車資）。
現在整條流程共用同一筆資料，每個數字都推得出來。

| 項目 | 現況 |
|---|---|
| 估價來源 | `services/ride.ts` —— 依**臺北市公告計程車費率**計算。距離由座標推算（直線 × 1.4 繞路係數），車速分尖峰／離峰／深夜，含夜間加成 |
| 估價區間 | 下界＝一路順暢只收里程費，上界＝加上行程時間三成的延滯計時。兩端各自對應一種真實路況，不是在中位數上下抓百分比 |
| 端點 | `GET /ride/estimate`（座標）、agent 工具 `estimate_ride`（地名） |
| `BookingScreen` | 目的地搜尋走 `/geocode`；快捷鍵接的是使用者自己的通勤路線與今天的行程，沒設定過就不顯示那顆 |
| `EstimateScreen` | 三個數字即時估算，顯示 `basis`、路況與距離 |
| `DriverArrivingScreen` | 上車點／目的地為真；司機與倒數為**模擬**，畫面標示「模擬派車」，倒數跑完自動進入行程中 |
| `TripInProgressScreen` | 目的地、車資、剩餘時間來自實際那一趟 |
| 對話 | 新增 `ride_estimate` 卡 —— 實測模型會把「非 yoxi 實際報價」那句吞掉，所以跟 `notice` 卡同一個模式，把真相放進畫面而不是靠提示詞 |
| `trip-options.ts` | 叫車選項從「刻意不給數字」改為給估算值，並跟其他選項一起排序（以前固定墊底是因為沒有時間依據） |

**四個入口都進同一條流程**：探索頁任務、對話的估價卡、通勤異常通知、下雨情境。
通知帶的只有站名沒有座標，所以估價頁會自己查（`lib/ride.ts` 的 `useResolvedPlace`）。

**仍未接上**：yoxi 的實際報價與派車系統（非公開合作項目）。
在那之前，估價是「依公告費率跑這段距離要多少錢」，不是 yoxi 會收多少錢 ——
`basis` 欄位就是在講這件事，前端**不可以**把它拿掉只留數字。

### B7：登入

`identity.ts` 的 `X-User-Ref` 是**裝置識別，不是身分驗證** —— 前端自己產生、
任何人都能偽造、不跨裝置。目前唯一的作用是讓不同裝置的通勤路線不會互相覆蓋。

沒有登入導致的實際缺口：

- 會員頁的統計（24 個任務 / 1,250 探索幣 / 86 km）是假的
- 「今天的行程」只能存在前端 localStorage，換手機就沒了
- 伺服器端的個人化功能（「提醒你該出發了」那類）做不了

接上之後，改成從驗證過的 token 取出 user id，`USER_REF_PROVIDER` 換掉，
其餘呼叫端不用動。

### B8：原生能力 —— 一個 plugin 都還沒裝

`apps/mobile/package.json` 目前只有 `@capacitor/core` / `ios` / `android`。
以下全部沒有實作：

| 能力 | 擋住了什麼 |
|---|---|
| 背景定位 | App 沒開時的任務通知 |
| 推播 | 通知只進得了 App 內收件匣，出不去 |
| 背景地理圍欄 | 走進任務範圍時、App 沒開也能提醒 |
| 相機 / AR | AR 任務 |

**前景地理圍欄已經做了**（`lib/geofence.ts`）：App 開著時持續定位，
跨進任務半徑就跳橫幅提示並可直接打卡。含遲滯緩衝（避免在邊界反覆觸發）
與精度門檻（定位誤差大於 100 公尺就不判定，寧可不報也不要誤報）。

剩下的是**背景**那一半，要做的事很具體：

| 步驟 | 內容 | 阻礙 |
|---|---|---|
| 1 | 裝背景定位外掛 | `@capacitor/geolocation` **不提供**作業系統層級的 region monitoring，要用社群或付費外掛 |
| 2 | 原生設定 | iOS 的 `allowsBackgroundLocationUpdates`、Info.plist 權限說明字串；Android 的 foreground service |
| 3 | 推播 | `@capacitor/push-notifications` + Firebase 專案 + APNs 憑證 |
| 4 | 實機測試 | 背景定位在模擬器上行為跟真機不同，**一定要真機** |

兩個硬限制先寫清楚，免得之後重新討論：

- **iOS 每個 App 最多只能同時監看 20 個圍欄**（`CLCircularRegion`）。
  任務多於 20 個時要自己做「只註冊最近的 N 個、移動後重新註冊」的輪替。
- **PWA 永遠做不到背景圍欄。** Service Worker 沒有定位能力，這不是還沒做，
  是規格上就沒有。這條路只有包成原生 App 才走得通。

設定頁的三個開關（附近任務通知、天氣與紫外線提醒、背景定位）標成「規劃中」
且刻意不能按，等對應能力做好時從 `PLANNED` 陣列搬上去就會生效。

### B9：Task.md 三個題目的剩餘缺口

| 題目 | 已有 | 缺 |
|---|---|---|
| **大眾交通接駁** | `favorite_stations`、`transit-watch.ts` 輪詢、App 內通知收件匣、通知直接帶去叫車 | **真正的推播**（依賴 B8）；yoxi／iRent／公共運輸的數位票券一鍵整合完全未動 |
| **AR 遊戲行程** | `missions` + PostGIS GiST、`/missions/nearby`、`campaigns` 表；**玩家進度 `user_missions` 與打卡完成**（010，伺服器端圍欄判定）；**社群日與尋寶行程**（011，`/campaigns/today` 排出多點順序並逐段判斷走路／叫車） | **動態地理圍欄沒有** —— 只有「查附近」與「到了自己按完成」，沒有進出圍欄的自動觸發（依賴 B8）；AR 沒有；**真正的多人共乘媒合做不到**（需要登入 + 即時位置 + 使用者密度，三者皆無），目前只提供「今天多少人跑過這場」的聚合熱度 |
| **精準導流** | 探索頁任務 →「叫車前往」帶座標到估價頁 | 尋寶任務包、動態需求形塑仍是概念 |

### B10：外部資料源

| 來源 | 用途 | 狀態 |
|---|---|---|
| OpenStreetMap | 地圖圖磚 | ✓ 已用（原本規劃的 MapTiler / Stadia 不需要了） |
| Open-Meteo | 天氣、紫外線 | ✓ 已用，免金鑰 |
| TDX | 捷運、公車即時狀態 | ✓ 已串接，**額度僅 5 次/分**（實測，非文件寫的 50 次/秒） |
| NVIDIA NIM | Agent 對話 | ✓ 已用 |
| 中央氣象署 | 天氣（升級選項） | 未申請。Open-Meteo 夠用，除非需要官方來源背書 |
| 國定假日行事曆 | 平日／假日班距判斷 | **未找到來源** —— 補班補假會算錯 |

---

## 已知缺口

### 未接行為的按鈕（0 顆）

09-17 清空。現在每一顆按鈕**不是接上了、就是明確 disabled 並標示原因**：

| 仍不能按的 | 標示 | 為什麼 |
|---|---|---|
| 司機頁的傳送訊息／撥打電話 | disabled | 沒有派車系統，沒有司機可以聯絡 |
| 行程頁的安全分享／緊急求助 | disabled | 需要真實行程 id 與後端 |
| 設定頁三個開關 | 「規劃中」 | 對應的原生能力還沒有（見 B8） |
| 會員頁的收藏地點／兌換紀錄 | 「規劃中」 | 收藏與點數系統不存在 |
| 設定頁的隱私權政策／服務條款 | disabled | 網址還沒有（見上架盤點） |

原則沿用設定頁那條：**一顆撥得動卻什麼都不會發生的開關，比沒有這個選項更糟。**

### 09-20 的 demo 補洞

demo 走一遍找出來的斷點，都已修掉：

| 問題 | 處理 |
|---|---|
| **首頁對話是一片空白** —— 助理有七個工具，但空輸入框不會告訴使用者任何一個 | 加 `ChatSuggestions`：依已設定的通勤路線與興趣給四句建議，聊起來就消失 |
| **興趣調查頁是裝飾用的** —— 自己寫死一份清單存在 local state，選了不影響探索頁篩選也不同步後端 | 改接 `lib/interests` 共用 store，並補上「看看附近有什麼」的出口 |
| 紫外線情境頁兩顆 CTA 都按不動 | 路線詳情 → 行程頁，計程車 → 叫車流程 |
| 紫外線頁寫死 8.5 公里 / NT$320 | 拿掉（實際約 15 公里），理由同雨天那頁 |
| `seed:notification` 要開 DevTools 撈裝置 ref | `/dev` 直接顯示並可點擊複製 |

### 假資料

- **司機與派車倒數** —— 模擬值，畫面上標示「模擬派車・示範速度」。
  倒數有時間壓縮（`lib/ride.ts` 的 `DEMO_SPEEDUP = 30`），不然 demo 要等二十幾分鐘
- **會員頁的等級、探索幣、完成任務數、走過距離** —— 示範數值，標在數字正下方
  而不是頁尾（那三個數字是這頁最醒目的東西，最容易被當成真的）
- 司機大頭照為佔位圖示
- 探索頁的任務進度浮動面板（`TaskProgress`）是設計稿還原，內容寫死
  （「完成今日散步推薦 2/5」）—— 沒有任務完成的追蹤機制
- 下雨／紫外線情境頁是**腳本化的還原稿**，對話內容照設計稿寫死；
  但「立即叫車」之後那一段是真的
- 車資是依公告費率估算，不是 yoxi 報價（見 B6）

### 路徑規劃的兩個洞

- **即時延誤沒有進規劃** —— TDX 只給事件文字，沒有誤點分鐘數，硬換算成秒數會是編的
- **國定假日判斷不了** —— 沒有行事曆來源，補班補假的班距會錯

### 設計稿與實作的差異（自行決定的部分）

- 預估車資頁的「確認叫車」CTA —— 設計稿沒有，原型需要能往下走
- 司機前往中的狀態列可點 —— 代替「司機抵達後自動跳轉」
- 任務進度面板往上展開 —— 設計稿畫在按鈕下方，實際會超出螢幕
- 行程頁的「下一段」改成從現在正推（「現在出發約 N 分鐘」），不是設計稿的
  「建議 08:05 出發」—— 反推出發時間要先知道使用者幾點要到，而通勤設定沒收集那個欄位
- 下雨情境最後一則助理訊息未實作 —— 設計稿被截圖邊緣切掉
- 下雨情境的計程車卡拿掉了車資與距離（設計稿寫 8.5 公里 / NT$350 / 35 分鐘，
  而板橋到市政府實際約 15 公里）—— 留著的話 demo 裡前後兩頁會互相打臉，
  該給數字的是下一頁
- 司機前往中改為倒數結束自動進入行程中（設計稿的原意），狀態列仍可點以便 demo 跳過

### 設計資產待補

- logo 向量檔、tab bar icon 切圖、illustration
  （`components/icons.tsx` 目前是照截圖描的近似線稿）
- tab icon 統一 —— `trips-frequent-routes` 與其他張不同套，待拍板
- 探索頁版本未拍板 —— 現用的 `exploration-home-5` 在「工作區」資料夾，屬探索過程產物
- 設定頁、會員頁的正式設計稿

---

## App Store 上架盤點

### 已完成

| 項目 | 狀態 |
|---|---|
| `PrivacyInfo.xcprivacy` | ✓ 已建立（Apple 2024 起強制，缺少直接退件） |
| 權限用途說明 | ✓ 5 項（定位、背景定位、相機、動作、照片） |
| 開發區域 | ✓ `en` → `zh-Hant` |
| 裝置架構 | ✓ `armv7`（32 位元）→ `arm64` |
| 螢幕方向 | ✓ 鎖定直式（設計稿只有直式版面） |
| 原生專案進版控 | ✓ `ios/`、`android/` 改為追蹤，只排除建置產物 |
| 後端位址防護 | ✓ 真機上指向 localhost 時主動警告 |
| 後端公開 HTTPS 位址 | ✓ Cloudflare Workers（原列為技術阻礙，已解決） |
| 真實地圖 | ✓ MapLibre（原列為技術阻礙，已解決） |
| 外部資料源 | ✓ 天氣、捷運、公車已接真（原列為技術阻礙，已解決） |

> `PrivacyInfo.xcprivacy` 必須如實反映實際行為。目前記錄的是「尚未蒐集個資」的狀態，
> 每次新增定位、登入、分析功能時都必須回頭更新，寫錯比沒寫更糟。

### 上架前必須完成

**會被 Apple 退件**
- App 圖示 —— 目前只有 1 張 Capacitor 預設佔位圖，需要 logo 向量檔
- 啟動畫面 —— 同上
- 隱私權政策網址（上架表單必填；設定頁那一列目前也是空連結）
- 技術支援網址（上架表單必填）
- App Store 各尺寸截圖
- Apple Developer 帳號（年費 US$99，有審核等待期）

**技術阻礙**
- 登入機制（見 B7）
- `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
- JDK（Android 建置）

**產品與法務**
- yoxi 叫車 API 合作（非公開）
- **Pokémon GO / Pikmin 的 IP 授權** —— 設計稿大量使用這兩個 IP 的名稱與角色，
  有商標風險，Apple 審核也可能因此退件。建議儘早釐清，這可能影響整個產品方向。
- LLM 成本與 rate limit 評估

---

## 環境需求

| 項目 | 狀態 |
|---|---|
| Node 24 | ✓ |
| Homebrew | ✓ |
| Colima + docker CLI + compose | ✓ 已安裝並驗證 |
| Xcode | ✓ 已安裝，但 `xcode-select` 指向 Command Line Tools |
| JDK（Android） | ✗ |
| GitHub 認證 | ✓ |
