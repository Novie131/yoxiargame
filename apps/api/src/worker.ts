import { app } from './app.ts'
import { useHyperdrive } from './db/client.ts'
import { pollTransit } from './services/transit-watch.ts'

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

/** Hyperdrive 綁定的形狀。wrangler.toml 的 [[hyperdrive]] 會把它掛在 env 上 */
type HyperdriveBinding = { connectionString?: unknown }

function applyEnv(env: Record<string, unknown>) {
  for (const [key, value] of Object.entries(env ?? {})) {
    // 只複製字串型設定，KV、R2 之類的資源綁定不屬於環境變數
    if (typeof value === 'string') process.env[key] = value
  }

  /*
   * Hyperdrive 是資源綁定不是環境變數，所以上面那個迴圈跳過了它（值是物件）。
   * 它帶的連線字串要單獨交給 db/client.ts —— 那之後整個後端用的還是 pg，
   * 跟 Node 部署完全同一套程式碼。
   *
   * 沒有設定綁定時什麼也不做，hasDatabase() 就會是 false，
   * 資料庫相關的功能照舊停用而不是壞掉。
   */
  const hyperdrive = env?.HYPERDRIVE as HyperdriveBinding | undefined
  const url = hyperdrive?.connectionString
  if (typeof url === 'string' && url) useHyperdrive(url)
}

export default {
  fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext) {
    applyEnv(env)
    return app.fetch(request, env, ctx)
  },

  /*
   * Cron Trigger（見 wrangler.toml 的 [triggers]）。每次觸發跑一輪交通監看。
   *
   * 要有 Hyperdrive 綁定這一輪才會真的做事 —— 沒有綁定時 hasDatabase() 是 false，
   * pollTransit 會回「沒有資料庫連線」就結束，不會拋錯。設定步驟見 wrangler.toml。
   */
  async scheduled(_event: ScheduledController, env: Record<string, unknown>, ctx: ExecutionContext) {
    applyEnv(env)
    ctx.waitUntil(
      pollTransit()
        .then((r) => console.log('[cron] transit-watch', JSON.stringify(r)))
        .catch((e: unknown) => console.error('[cron] transit-watch 失敗：', e)),
    )
  },
}
