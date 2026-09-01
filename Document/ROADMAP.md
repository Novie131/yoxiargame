# ROADMAP

最後更新：2026-09-02

目標：從「視覺原型」長成正式產品。
原型階段是 UI 先行、資料造假；正式階段相反 —— 先打通資料層。

---

## 已完成

### 階段 0-4：原型（2026-08-30 ~ 08-31）

- 技術選型：Expo → **Capacitor**（雙平台需求）
- `apps/mobile` 骨架：Vite + React + TypeScript + Tailwind + React Router
- `Document/` 35 張設計稿改名、建索引、取樣色票
- 11 個畫面實作完成（見 `Document/README.md`）
- `apps/api` 骨架：Hono + Vercel AI SDK v7，provider 可切換
- Commit `b389e61` 推上 `feat/prototype-scaffold`

**產出**：一條可走的流程 —— 下雨情境 → 立即叫車 → 預估車資 → 確認叫車 → 司機前往中 → 行程進行中。

---

## 進行中

### B1：資料層打通 —— 已驗證通過

| 項目 | 狀態 |
|---|---|
| 容器執行環境 | ✓ Colima 0.10.3（**不用 Docker Desktop**） |
| Postgres + PostGIS | ✓ PostGIS 3.6.4、pgcrypto 1.3 |
| Redis | ✓ 7-alpine |
| DB 連線層 | ✓ `apps/api/src/db/client.ts` |
| migration 執行機制 | ✓ 已驗證冪等 |
| repository 層 | ✓ `db/repositories/commute.ts` |
| 驗證：真的寫進 DB | ✓ smoke test 通過，資料已確認落地 |

**已建立的資料表**：`analytics_events`、`campaigns`、`external_user_refs`、
`favorite_stations`、`idempotency_records`、`missions`、`transit_disruptions`
（外加 `schema_migrations` 追蹤表）。
`missions_location_gix` GiST 地理索引已建立。

**環境安裝腳本**：`/Users/imacuser/tse/ensure-docker.sh`（在 repo 之外，不進版控）

剩餘：其餘四個工具仍回假資料；無身分驗證，使用者寫死為 `DEV_USER_REF`。

**為什麼先做這個**：B2 依賴 B1；B3 依賴外部 key 申請（有等待時間）；B4 依賴設計稿。
只有 B1 現在就能全速做、不依賴任何外部條件。

---

## 待辦

### B2：API 契約

- `packages/shared` 放前後端共用型別
- Agent 的 5 個工具從假資料改成查 DB / 外部來源
- `apps/mobile` 開始真的呼叫後端

### B3：外部資料源

| 來源 | 用途 | Key 狀態 |
|---|---|---|
| MapTiler 或 Stadia | 真實地圖圖磚（取代設計稿截圖） | 未申請 |
| 中央氣象署開放資料 | 天氣、紫外線指數 | 未申請 |
| TDX 運輸資料流通服務 | 捷運、公車即時狀態 | 未申請 |
| NVIDIA NIM | Agent 對話 | `.env` 已建立，**NVIDIA_API_KEY / NVIDIA_MODEL 待填** |

> 前三個審核需要時間，建議儘早申請。

### B4：補完缺口

- 設定頁、會員頁 —— **設計稿未提供，需設計師出稿**
- tab icon 統一（`trips-frequent-routes` 與其他張不同套，待拍板）
- 探索頁重新確認（目前用的 `exploration-home-5` 在「工作區」，未拍板）
- 15 顆按鈕未接行為（見下方「已知缺口」）
- 真機建置：`xcode-select` 指向 Xcode.app、安裝 JDK
- 原生能力：背景定位、geofencing、推播、AR

---

## 已知缺口

### 未接行為的按鈕（27 顆中的 15 顆）

| 畫面 | 未接 |
|---|---|
| 行程 – 常用路線 | 4 / 4 |
| 叫車 ①選上車點 | 4 / 5 |
| 叫車 ③司機前往中 | 3 / 5 |
| 行程進行中 | 2 / 2 |
| 探索 | 1 / 2 |

### 假資料

- 地圖是設計稿截圖，不能拖曳縮放（`MapBackdrop` 元件已隔離，換 MapLibre 時上層不動）
- 天氣、車資、路線狀態全為寫死的值（對齊設計稿數值）
- 司機大頭照為佔位圖示

### 設計稿與實作的差異（我自行決定的部分）

- 預估車資頁的「確認叫車」CTA —— 設計稿沒有，原型需要能往下走
- 司機前往中的狀態列可點 —— 代替「司機抵達後自動跳轉」
- 任務進度面板往上展開 —— 設計稿畫在按鈕下方，實際會超出螢幕
- 下雨情境最後一則助理訊息未實作 —— 設計稿被截圖邊緣切掉

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
