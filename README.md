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

設計稿 11 個畫面已實作完成，資料全為假資料。
詳細進度與待辦見 `Document/README.md`。

未完成：設定頁與會員頁（設計稿未提供）、真實地圖圖磚、
外部資料串接（中央氣象署、TDX）、資料庫連線。
