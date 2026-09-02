import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { streamAgentReplyWithFallback, type ChatMessage } from './agent/index.ts'
import { sanitizeMessages } from './agent/sanitize.ts'
import { hasDatabase } from './db/client.ts'
import { getWeather } from './services/weather.ts'

/*
 * Hono app 本體。Node（src/index.ts）與 Cloudflare Workers（src/worker.ts）
 * 兩個進入點共用這個檔案，行為完全一致。
 */

export const app = new Hono()

/*
 * CORS：正式環境只允許自己的前端網域。
 * 沒設定 ALLOWED_ORIGINS 時全開，方便本機開發；
 * 部署時務必設定，否則任何網站都能呼叫這個後端、消耗你的 API 額度。
 */
app.use('/*', (c, next) => {
  const configured = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

  return cors({
    origin: configured.length ? configured : '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 86400,
  })(c, next)
})

/*
 * 部署診斷用。只回報設定「是否存在」，絕不回傳金鑰本身。
 * 部署後最常見的問題就是環境變數沒設或沒重新部署，
 * 沒有這個端點只能盲猜。
 */
app.get('/health', (c) => {
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
    model: process.env.NVIDIA_MODEL ?? process.env.LOCAL_MODEL ?? null,
    fallbackModel: process.env.LLM_FALLBACK_MODEL ?? null,
    allowedOrigins: process.env.ALLOWED_ORIGINS || '(未設定，目前全開)',
  })
})

/*
 * 首頁標題列的即時天氣。前端傳定位座標進來，這裡代打外部 API：
 * 瀏覽器不用直接連第三方（省掉 CORS 與之後換資料來源的麻煩），
 * 而且回應在伺服器端有快取，不會每次開 App 都打一次。
 */
app.get('/weather', async (c) => {
  const lat = Number(c.req.query('lat'))
  const lon = Number(c.req.query('lon'))

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return c.json({ error: 'lat 與 lon 必須是數字' }, 400)
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return c.json({ error: 'lat 或 lon 超出合理範圍' }, 400)
  }

  try {
    const weather = await getWeather(lat, lon)
    /* 用戶端也快取幾分鐘，切分頁回來不用重打 */
    c.header('Cache-Control', 'public, max-age=300')
    return c.json(weather)
  } catch (error) {
    console.error('[weather]', error)
    return c.json({ error: '天氣服務暫時無法取得' }, 502)
  }
})

app.post('/agent/chat', async (c) => {
  let body: { messages?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: '請求內容不是合法的 JSON' }, 400)
  }

  const result = sanitizeMessages(body.messages)
  if (!result.ok) return c.json({ error: result.error }, 400)

  const messages: ChatMessage[] = result.messages

  // 純文字串流，前端直接讀 response.body 即可，不用實作額外協定
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamAgentReplyWithFallback(messages)) {
          controller.enqueue(encoder.encode(chunk))
        }
      } catch (error) {
        // 只記錄在伺服器端，不把內部訊息回給前端
        console.error('[agent/chat]', error)
        controller.enqueue(encoder.encode('\n\n[發生錯誤，請稍後再試]'))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
})
