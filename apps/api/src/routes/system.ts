import { Hono } from 'hono'

import { hasDatabase } from '../db/client.ts'
import { pollTransit } from '../services/transit-watch.ts'
import { hasTdxCredentials } from '../services/tdx.ts'

/*
 * 維運用的端點。前端不會呼叫，所以不需要型別化的輸入驗證。
 */

export const systemRoutes = new Hono()
  /*
   * 部署診斷用。只回報設定「是否存在」，絕不回傳金鑰本身。
   * 部署後最常見的問題就是環境變數沒設或沒重新部署，
   * 沒有這個端點只能盲猜。
   */
  .get('/health', (c) => {
    const provider = process.env.LLM_PROVIDER ?? 'nvidia'
    const keyName =
      provider === 'anthropic'
        ? 'ANTHROPIC_API_KEY'
        : provider === 'local'
          ? 'LOCAL_API_KEY'
          : 'NVIDIA_API_KEY'

    return c.json({
      ok: true,
      provider,
      database: hasDatabase() ? 'connected' : 'disabled',
      apiKeyConfigured: Boolean(process.env[keyName]),
      tdxConfigured: hasTdxCredentials(),
      model: process.env.NVIDIA_MODEL ?? process.env.LOCAL_MODEL ?? null,
      fallbackModel: process.env.LLM_FALLBACK_MODEL ?? null,
      allowedOrigins: process.env.ALLOWED_ORIGINS || '(未設定，目前全開)',
    })
  })

  /*
   * 手動觸發一輪監看。
   *
   * 正式環境是由 Cloudflare 的 Cron Trigger 呼叫 worker.ts 的 scheduled()，
   * 不會經過這裡；這個端點是給本機開發與部署後驗證用的。
   *
   * 必須設定 POLL_TOKEN 才會存在 —— 沒設定就回 404，讓它在正式環境預設是關的。
   * 它會消耗 TDX 額度並寫入通知，不是能公開的東西。
   */
  .post('/internal/poll', async (c) => {
    const token = process.env.POLL_TOKEN
    if (!token) return c.json({ error: 'Not Found' }, 404)
    if (c.req.header('X-Poll-Token') !== token) return c.json({ error: '未授權' }, 401)

    const result = await pollTransit()
    return c.json(result)
  })
