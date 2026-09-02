import { app } from './app.ts'

/*
 * Cloudflare Workers 進入點。
 *
 * 為什麼要手動把 env 併進 process.env：
 *
 * Workers 把設定分成兩類，取得方式不同：
 *   wrangler.toml 的 [vars] —— 部署時內嵌，process.env 讀得到
 *   secrets（如 API key）    —— 執行期才綁定到 fetch 的 env 參數上，
 *                               不保證出現在 process.env
 *
 * 實測就是這個差異：/health 讀得到 NVIDIA_MODEL（vars），
 * 卻讀不到 NVIDIA_API_KEY（secret）。
 *
 * 這裡在每次請求時把 env 併進 process.env，讓 agent/ 與 db/ 底下的程式碼
 * 沿用同一套 process.env 寫法，Node 與 Workers 兩種執行環境行為一致，
 * 不必為了部署平台在各處改寫成傳遞 context 的形式。
 */
export default {
  fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext) {
    for (const [key, value] of Object.entries(env)) {
      // 只複製字串型設定，KV、R2 之類的資源綁定不屬於環境變數
      if (typeof value === 'string') process.env[key] = value
    }
    return app.fetch(request, env, ctx)
  },
}
