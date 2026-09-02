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
 */

/* 診斷用：記錄實際從 env 綁定看到哪些「名稱」。永遠不記錄值。 */
export const seenEnvKeys: string[] = []

export default {
  fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext) {
    seenEnvKeys.length = 0
    for (const key of Object.keys(env ?? {})) {
      seenEnvKeys.push(key)
      const value = (env as Record<string, unknown>)[key]
      // 只複製字串型設定，KV、R2 之類的資源綁定不屬於環境變數
      if (typeof value === 'string') process.env[key] = value
    }
    return app.fetch(request, env, ctx)
  },
}
