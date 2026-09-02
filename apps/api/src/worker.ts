import { app } from './app.ts'

/*
 * Cloudflare Workers 進入點。
 * Workers 沒有常駐的 process，直接匯出 fetch handler 即可。
 * 環境變數透過 wrangler.toml 的 vars 與 secrets 提供，
 * 搭配 nodejs_compat 旗標後可用 process.env 讀取，與 Node 版行為一致。
 */
export default app
