# yoxi ar game

結合位置型任務遊戲、通勤助理與叫車的手機 App 原型。

- 探索：地圖上有任務點，走到附近就能解任務
- 通勤助理：用聊天的方式問「從西門町到台北車站怎麼走」，會用真實的捷運資料規劃路線，並附上天氣與帶傘建議
- 叫車：估算計程車車資並走完叫車流程（目前司機與派車是模擬的）

目前還是原型，尚未上架。

## 目錄

1. [需要的工具](#1-需要的工具)
2. [下載專案](#2-下載專案)
3. [只跑前端畫面](#3-只跑前端畫面)
4. [完整執行（後端、資料庫、AI 聊天）](#4-完整執行後端資料庫ai-聊天)
5. [常見問題](#5-常見問題)
6. [金鑰不要上傳](#6-金鑰不要上傳)
7. [其他文件](#7-其他文件)

## 1. 需要的工具

| 工具 | 用途 | 確認方式 | 下載 |
|---|---|---|---|
| Node.js 24 以上 | 執行程式（必裝） | 終端機輸入 `node -v`，顯示 `v24.x.x` 或更高 | [nodejs.org](https://nodejs.org/)（選 LTS 版） |
| Git | 下載專案（必裝） | 輸入 `git --version` 有顯示版本號 | [git-scm.com](https://git-scm.com/) |
| Docker Desktop | 跑資料庫（只有完整執行需要） | 打開 Docker Desktop，確認它在執行中 | [docker.com](https://www.docker.com/products/docker-desktop/) |

終端機的開法：

- Mac：按 `Command + 空白鍵`，輸入「終端機」或「Terminal」
- Windows：建議用安裝 Git 時附帶的 Git Bash，或使用 WSL

以下程式碼框裡的指令，都是貼到終端機後按 Enter 執行。

## 2. 下載專案

```bash
git clone https://github.com/Novie131/yoxiargame.git
cd yoxiargame
```

之後的指令都要在 `yoxiargame` 資料夾裡執行。

## 3. 只跑前端畫面

不需要 Docker，也不用申請金鑰，適合先看看畫面。

安裝前端套件（第一次才需要，約一兩分鐘）：

```bash
npm install --prefix apps/mobile
```

啟動：

```bash
npm run dev
```

看到 `Local: http://localhost:5173/` 之後，用瀏覽器打開 http://localhost:5173/dev 。這是導覽頁，可以直接點進每個畫面。用 Chrome 的話，按 `F12` 再點左上角的手機圖示，可以切成手機尺寸。

這個模式沒有後端，聊天、路線規劃、任務點等需要資料的地方會是空的或顯示錯誤，屬於正常現象。

要停止就在終端機按 `Ctrl + C`。

## 4. 完整執行（後端、資料庫、AI 聊天）

### 4.1 安裝套件

```bash
npm install --prefix apps/mobile
npm install --prefix apps/api
```

### 4.2 建立設定檔

```bash
cp apps/api/.env.example apps/api/.env
```

用任何文字編輯器打開 `apps/api/.env`，填入下面幾個欄位：

| 欄位 | 用途 | 申請方式 | 沒填的影響 |
|---|---|---|---|
| `NVIDIA_API_KEY` | AI 聊天助理 | 到 [build.nvidia.com](https://build.nvidia.com/) 註冊取得，格式為 `nvapi-...` | 聊天無法使用 |
| `NVIDIA_MODEL` | 指定 AI 模型 | 可先填 `nvidia/nemotron-3-super-120b-a12b` | 聊天無法使用 |
| `TDX_CLIENT_ID`<br>`TDX_CLIENT_SECRET` | 捷運、公車即時資料 | 到 [tdx.transportdata.tw](https://tdx.transportdata.tw/) 註冊 → 會員中心 → API 金鑰管理 | 路線規劃與交通狀態沒有資料 |

填好後的樣子（以下為假資料）：

```
NVIDIA_API_KEY=nvapi-你的金鑰
NVIDIA_MODEL=nvidia/nemotron-3-super-120b-a12b
TDX_CLIENT_ID=你的-client-id
TDX_CLIENT_SECRET=你的-client-secret
```

其他欄位保持預設值即可。

不想申請 NVIDIA 金鑰的話，也可以用本機的模型（例如 [Ollama](https://ollama.com/)）：把 `LLM_PROVIDER=nvidia` 改成 `LLM_PROVIDER=local`，再把 `LOCAL_MODEL=` 填上在 Ollama 下載的模型名稱。

### 4.3 啟動

先確認 Docker Desktop 已經開啟，然後執行：

```bash
npm run dev:all
```

這個指令會依序啟動資料庫、建立資料表、啟動後端與前端。第一次需要下載並建置資料庫，會比較久，看到「全部啟動」就完成了。

### 4.4 匯入示範資料（第一次需要）

另外開一個終端機視窗（原本的保持執行），回到專案資料夾後執行：

```bash
npm --prefix apps/api run seed:missions        # 探索頁的任務點
npm --prefix apps/api run seed:notification    # 一則示範用的通勤異常通知（可略過）
```

### 4.5 開始使用

打開 http://localhost:5173/dev ，可以試試：

- 在聊天頁輸入「幫我安排西門町到台北車站」
- 到探索頁點任務，按「叫車前往」走一次叫車流程

### 4.6 停止

- 前端與後端：在執行 `npm run dev:all` 的終端機按 `Ctrl + C`
- 資料庫會留在背景執行，要關閉請執行 `npm run db:down`

## 5. 常見問題

**出現 `npm: command not found` 或 `node: command not found`**
Node.js 沒有裝好。安裝完成後要關掉終端機再重新打開。

**出現「docker daemon 沒有在跑，先打開 Docker Desktop」**
打開 Docker Desktop，等它完全啟動後再執行一次。

**出現 `Port 5173 is in use` 或 `EADDRINUSE: 3000`**
之前啟動的程式還沒關。找到那個終端機按 `Ctrl + C`。

**出現「Postgres 等了 30 秒還是接不上」**
執行 `npm run db:logs` 查看資料庫的錯誤訊息。第一次建置比較慢，可以再執行一次 `npm run dev:all`。

**聊天回錯誤或回應很慢**
先檢查 `apps/api/.env` 的 `NVIDIA_API_KEY` 和 `NVIDIA_MODEL` 是否正確。NVIDIA 的免費服務偶爾會忙碌（503 錯誤），程式會自動重試，稍後再試即可。

**路線規劃顯示「沒查到」**
TDX 金鑰沒填，或超過使用量（每分鐘 5 次），等一分鐘再試。

**Windows 無法執行 `npm run dev:all`**
這是 Mac／Linux 的腳本，請在 Git Bash 或 WSL 中執行。或者開三個終端機分別執行 `npm run db:up`、`npm run dev:api`、`npm run dev`（第一次要先執行 `npm run db:migrate`）。

**想安裝到手機上**
iPhone 需要 Mac 與 Xcode，Android 需要 Android Studio：

```bash
npm run ios
npm run android
```

## 6. 金鑰不要上傳

`apps/api/.env` 裡有你的私人金鑰，不要上傳到 GitHub 或分享給別人。

- 專案已設定讓 git 忽略 `.env`，正常操作不會被上傳
- 不要把金鑰寫進 `.env.example` 或任何程式碼檔案，這些檔案會被上傳
- 萬一不小心上傳了，請立刻到該服務的網站作廢金鑰並重新產生。只刪除檔案沒有用，git 歷史紀錄裡還是查得到

## 7. 其他文件

| 文件 | 內容 |
|---|---|
| [Document/DEV_NOTES.md](Document/DEV_NOTES.md) | 技術選型、架構設計、實作細節 |
| [Document/PlanMD/ROADMAP.md](Document/PlanMD/ROADMAP.md) | 開發進度與待辦 |
| [Document/PlanMD/FEATURES_v1.md](Document/PlanMD/FEATURES_v1.md) | 提案中的功能 |
| [Document/README.md](Document/README.md) | 設計稿截圖索引 |

### 專案結構

```
apps/mobile    App 畫面（前端）
apps/api       後端伺服器與 AI 助理
infra/         資料庫設定
scripts/       啟動用腳本
Document/      設計稿截圖與規劃文件
```

### 常用指令

```bash
npm run dev          # 只啟動前端，http://localhost:5173
npm run dev:api      # 只啟動後端，http://localhost:3000
npm run dev:all      # 資料庫、後端、前端一起啟動
npm run db:up        # 啟動資料庫
npm run db:down      # 關閉資料庫
npm run db:migrate   # 建立或更新資料表
npm run typecheck    # 型別檢查
npm run lint         # 程式碼風格檢查
```
