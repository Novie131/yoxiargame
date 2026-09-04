import { app } from './app.ts'
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

function applyEnv(env: Record<string, unknown>) {
  for (const [key, value] of Object.entries(env ?? {})) {
    // 只複製字串型設定，KV、R2 之類的資源綁定不屬於環境變數
    if (typeof value === 'string') process.env[key] = value
  }
}

export default {
  fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext) {
    applyEnv(env)
    return app.fetch(request, env, ctx)
  },

  /*
   * Cron Trigger（見 wrangler.toml 的 [triggers]）。每次觸發跑一輪交通監看。
   *
   * ⚠️ 目前這在 Workers 上會直接 no-op：db/client.ts 用的 pg 需要 TCP，
   * Workers 不支援，所以那邊不會設定 DATABASE_URL，pollTransit 會回
   * 「未設定 DATABASE_URL」就結束。真正會跑的是 Node 部署（src/index.ts）。
   *
   * 要讓 Workers 也能跑，得把資料庫連線換成 Workers 相容的方式
   * （Hyperdrive，或 Neon / Supabase 的 HTTP driver）。這裡先把排程接好，
   * 換掉連線層之後不用再動這個檔案。
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
