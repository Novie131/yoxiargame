# yoxi ar game

位置型任務遊戲 + 通勤助理 + 叫車的整合行動應用原型。

## 技術選型

| 層 | 選擇 | 理由 |
|---|---|---|
| App 殼 | Capacitor 8 | iOS + Android 一份程式碼；原生能力用 Swift/Kotlin plugin 補 |
| 前端 | Vite 8 + React 19 + TypeScript + Tailwind 4 | 刻設計稿最快 |
| 路由 | React Router 8 | |
| 後端 | Hono + Node 24（原生跑 TypeScript，免 build） | |
| LLM | Vercel AI SDK v7，provider 可切換 | NVIDIA NIM / Anthropic 一行切換 |
| 資料庫 | PostgreSQL + PostGIS + Redis | 任務用地理圍欄，需要 GiST 索引 |

## 目錄

```
apps/mobile        Capacitor + React 前端
apps/api           Hono 後端與 Agent
infra/             Postgres（含 PostGIS）與 Redis 的 compose 設定
Document/          Figma 設計稿截圖與索引（見 Document/README.md）
```

## 開發

```bash
# 前端 :5173
npm run dev

# 後端 :3000（需先建立 apps/api/.env）
npm run dev:api

# 資料庫
npm run db:up

# 檢查
npm run typecheck
npm run lint
```

`/dev` 路由是原型導覽頁，可直接跳到任一畫面。

## 環境變數

```bash
cp apps/api/.env.example apps/api/.env
```

`.env` 已被 git 忽略。`NVIDIA_MODEL` 沒有預設值，需到 build.nvidia.com 取得目前可用的 model id。

## 出真機 app

```bash
npm run ios       # 需要 xcode-select 指向 Xcode.app
npm run android   # 需要 JDK（裝 Android Studio 會一起帶）
```

Capacitor 8 使用 Swift Package Manager，不需要 CocoaPods。
`apps/mobile/ios` 與 `apps/mobile/android` 不進版控，可用 `npx cap add` 重建；
若之後要寫自訂原生程式碼，需把 `.gitignore` 裡那兩行拿掉。

## 目前狀態

設計稿 11 個畫面已實作完成。天氣、捷運路徑規劃、捷運與公車即時狀態已接真實來源；
叫車估價（`estimate_ride`）仍是假資料。詳細進度與待辦見 `Document/README.md`。

未完成：設定頁與會員頁（設計稿未提供）、真實地圖圖磚、中央氣象署串接、
yoxi 叫車估價 API。

### 位置與路徑規劃

對話助理知道使用者在哪裡：前端每次發話都把定位帶進 `/agent/chat` 的 `location`
欄位，所以「幫我安排當前位置到北車」直接規劃，不用反問。拿不到定位時工具會回
`need_location`，串流會送一張卡片讓使用者當場開啟定位或手動輸入地點
（走 `/geocode`），設定完自動用同一句話重問一次。

退路座標（信義區）**不會**被當成使用者位置送給後端 —— 那會讓人在台中卻拿到
從市政府站出發的路線。

`plan_route` 自己會把起訖點的天氣一起查回來，畫面同時排出路線卡與天氣卡。
刻意不靠模型再呼叫一次 `get_weather` —— 實測它常常呼叫了卻不帶地點，
於是退回去用定位，使用者明明說了「西門町到北車」卻被要求開啟定位。

路徑規劃用 **Yen's K-Shortest Loopless Paths + Dijkstra**，回傳建議路線與備選。
備選會濾掉「又慢又要多轉一次」的路（Pareto 支配），所以常常是空的，那是正確的。
不用 A\* 的理由寫在 `services/route-planner.ts` 的檔頭。

天氣除了現況，另外抓 8 小時逐時預報，導出帶傘（降雨機率 ≥ 30%）與依**體感溫度**
分級的穿著建議。首頁小卡刻意只顯示「有事才提醒」的那幾則，穿著建議不算事件。

捷運與公車即時狀態已接上 TDX（需在 `.env` 填 `TDX_CLIENT_ID` / `TDX_CLIENT_SECRET`），
端點為 `/transit/metro?line=` 與 `/transit/bus?route=&city=&stop=`。
`/transit/plan?from=&to=` 回傳最佳路線（欄位攤平在最外層）加上 `alternatives`；
路網圖快取一天，這支不吃 TDX 額度。`/geocode?q=` 是地名轉座標。
站名比對會把「臺」摺成「台」（TDX 站表寫的是「台北車站」），
所以兩種寫法都查得到。

TDX 實測額度是**每分鐘 5 次**，不是文件寫的每秒 50 次，所以
`services/tdx.ts` 的快取、併發合流與配額守門都不能拿掉。
兩邊拿得到的資料不對稱，畫面上不要硬湊成一樣：

| | 捷運 | 公車 |
|---|---|---|
| 到站倒數 | 無（LiveBoard 只有「正在進站」快照） | 有，真實秒數 |
| 誤點分鐘數 | 無 | 無 |
| 事件通報 | 有 | 有 |
