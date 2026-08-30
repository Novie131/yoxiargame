# 設計稿索引

Figma 檔：`hmzgL6hhIWJkp6Zy4hsg9L`（yoxi）
截圖日期：2026-08-30。檔名 = Figma 上的 frame 名稱。

> 目前團隊帳號對這個 Figma 檔只有檢視權限，MCP 讀不到，所以一切以本資料夾的截圖為準。
> 若之後拿到編輯權限，色票與間距應改為對齊 Figma variables。

---

## 初步確定方向/ — 已確定的方向，優先實作

這 9 張是拍板的版本。共同結構：5 格 tab bar（行程／探索／中央 yoxi 圓鈕／設定／會員）+ 底部文字輸入列。

| 檔名 | 畫面 | 說明 |
|---|---|---|
| `agent-home-interests.png` | 首頁 Agent_興趣調查 | 首次進入的興趣標籤選取。**已實作** |
| `agent-home-activity.png` | 首頁 Agent_活動示意 | 對話式活動推薦，含路線卡 |
| `agent-home-commute-setup.png` | 首頁 Agent_通勤路線設定 | 對話中設定通勤路線 |
| `rainy-commute-notification.png` | 下雨情境 | 藍色系（`#2D679D` / `#E3F1FD`），行程建議調整 |
| `uv-alert-commute-notification.png` | 紫外線警示情境 | 米黃底 + 警示卡 |
| `yoxi-booking.png` | 叫車 ①／選上車點 | 地圖 + 地點卡 + 「呼叫 yoxi」 |
| `yoxi-ride-estimate.png` | 叫車 ②／預估車資 | 深色地圖 + 時間軸 + 約 15 分鐘 / NT$250-320 |
| `yoxi-driver-arriving.png` | 叫車 ③／司機前往中 | 司機卡（陳建宏 / TOYOTA / TDA-8899） |
| `yoxi-trip-in-progress.png` | 叫車 ④／行程進行中 | 台北 101 / 12 分鐘 / NT$285 / 安全共乘 |

## 行程-常用路線/

| 檔名 | 畫面 | 說明 |
|---|---|---|
| `trips-frequent-routes.png` | 行程 – 常用路線 | 深藍「下一段」卡 + 常用路線卡 + 通勤提醒。注意：此稿的 tab icon 與上面那批**不同套**，實作前要確認以哪版為準 |

## 工作區/ — 探索過程，非最終方向

保留作為脈絡參考，不要直接照著實作。

**探索頁系列**
`exploration-home-1` ~ `-5`（同一頁的 5 個階段）、`exploration-home-v2`、`pikmin-exploration-home`
內容：Lv.12 城市探索家、興趣選取卡、篩選 chips、今日散步推薦大圖卡、探索附近清單（含評分與距離）

**Pokémon GO 活動**
`pokemon-event-list.png`、`pokemon-event-map.png`

**對話式助理概念（早期，4 格 tab：日報／探索／設定／會員）**
`concept-1-conversation.png`、`concept-2-assistant-map.png`、`concept-3-full-chat.png`、`agent-chat-pokemon-gofest.png`、`yoxi-smart-mobility-home.png`

**通勤站點**
`my-station-normal.png`、`my-station-crisis.png`（捷運延誤情境，對應 DB 的 `transit_disruptions`）

**任務 UI**
`task-ui-container.png`、`task-ui-concepts-presentation.png`、`presentation-task-progress-modes.png`（任務進度：內嵌 vs. 總覽兩種模式對比）

**簡報畫布 / 其他**
`presentation-agent-chat-input-vs-fab.png`（輸入列 vs. 浮動鈕對比）、`presentation-canvas-crop.png`、`ride-hailing-map.png`、`iphone-17-3.png`、`iphone-17-5.png`

**參考資料（非設計稿）**
`ref-current-yoxi-app.png` — 現行 yoxi App 的實機截圖

---

## 色票

取樣自本資料夾截圖（解碼 PNG 後統計出現頻率，跨 11 張交叉比對）。
實作定義在 `apps/mobile/src/index.css` 的 `@theme`。

| Token | 色碼 | 用途 |
|---|---|---|
| `primary` | `#D8654F` | 主 CTA、選取態、active tab |
| `brand-red` | `#EA3E28` | yoxi logo |
| `ink` | `#162037` | 主文字、深色卡片 |
| `muted` / `subtle` | `#505869` / `#8A8F9B` | 次要／第三層文字 |
| `primary-tint` | `#FBF1ED` | 提示卡、chip 底 |
| `success` | `#43846D` / `#EBF7F1` | 準時、路線正常 |
| `info` | `#2D679D` / `#E3F1FD` | 下雨情境 |
| `warning-tint` | `#FCF3CC` | 紫外線警示 |

## 待補資產

logo 向量檔、tab bar icon 切圖、illustration。目前 `apps/mobile/src/components/icons.tsx` 是照截圖描的近似線稿。
