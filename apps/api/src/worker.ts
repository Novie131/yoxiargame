import { app } from './app.ts'

/*
 * Cloudflare Workers 進入點。
 *
 * Workers 把設定分成兩類，取得方式不同：
 *   wrangler.toml 的 [vars] —— 部署時內嵌，process.env 讀得到
 *   secrets（如 API key）    —— 執行期綁定到 fetch 的 env 參數上
 *
 * 這裡在每次請求時把 env 併進 process.env，讓 agent/ 與 db/ 沿用
 * 同一套 process.env 寫法，Node 與 Workers 行為一致。
 *
 * 部署踩過的坑：Dashboard 的「Variables and Secrets」介面在搭配
 * Workers Builds 時不會真的把 secret 綁上去 —— 畫面上看得到，
 * 但 Worker 執行時的 env 裡沒有它。必須用 CLI 設定：
 *   npx wrangler secret put NVIDIA_API_KEY
 * 這種方式綁在 Worker script 本身而非某個版本，會在後續部署間保留。
 */

export default {
  fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext) {
    for (const [key, value] of Object.entries(env ?? {})) {
      // 只複製字串型設定，KV、R2 之類的資源綁定不屬於環境變數
      if (typeof value === 'string') process.env[key] = value
    }
    return app.fetch(request, env, ctx)
  },
}
