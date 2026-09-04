import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { streamAgentReplyWithFallback, type ChatMessage } from './agent/index.ts'
import { sanitizeMessages } from './agent/sanitize.ts'
import { hasDatabase } from './db/client.ts'
import type { TransportMode } from './db/repositories/commute.ts'
import { readUserRef } from './identity.ts'
import { clearRoute, readRoute, saveRoute } from './services/commute.ts'
import {
  getBusStatus,
  getMetroStatus,
  hasTdxCredentials,
  isBusCity,
  searchMetroStations,
} from './services/tdx.ts'
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
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    /* X-User-Ref 是前端帶的裝置識別，見 identity.ts —— 不是身分驗證 */
    allowHeaders: ['Content-Type', 'X-User-Ref'],
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
    tdxConfigured: hasTdxCredentials(),
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

/*
 * 捷運與公車即時狀態，資料來自 TDX。
 *
 * 一定要由後端代打，不能讓前端直接連 TDX：
 *   1. 金鑰不能進到瀏覽器
 *   2. TDX 額度只有每分鐘 5 次，集中在後端才有辦法共用快取與配額守門
 *
 * Cache-Control 的秒數刻意跟 services/tdx.ts 的 TTL 一致，
 * 讓用戶端在同一個時間窗內不會重複回來要。
 */
app.get('/transit/metro', async (c) => {
  const line = c.req.query('line')?.trim()
  if (!line) return c.json({ error: '缺少 line 參數' }, 400)
  if (!hasTdxCredentials()) return c.json({ error: 'TDX 金鑰未設定' }, 503)

  try {
    const status = await getMetroStatus(line)
    if (!status) return c.json({ error: `查不到「${line}」這條捷運路線` }, 404)

    c.header('Cache-Control', 'public, max-age=30')
    return c.json(status)
  } catch (error) {
    console.error('[transit/metro]', error)
    return c.json({ error: '捷運即時服務暫時無法取得' }, 502)
  }
})

app.get('/transit/bus', async (c) => {
  const route = c.req.query('route')?.trim()
  const city = c.req.query('city')?.trim() || 'Taipei'
  const stop = c.req.query('stop')?.trim() || undefined

  if (!route) return c.json({ error: '缺少 route 參數' }, 400)
  if (!isBusCity(city)) return c.json({ error: `不支援的縣市代碼「${city}」` }, 400)
  if (!hasTdxCredentials()) return c.json({ error: 'TDX 金鑰未設定' }, 503)

  try {
    const status = await getBusStatus(city, route, stop)
    c.header('Cache-Control', 'public, max-age=30')
    return c.json(status)
  } catch (error) {
    console.error('[transit/bus]', error)
    return c.json({ error: '公車即時服務暫時無法取得' }, 502)
  }
})

/*
 * 捷運站名建議。設定通勤路線時前端邊打邊查，讓使用者選的是真的存在的站 ——
 * 站名要對得上 TDX，之後查即時狀態與推導路線名才有意義。
 *
 * 站表是靜態資料，服務端快取一天，這裡也讓用戶端快取久一點。
 */
app.get('/transit/stations', async (c) => {
  const q = c.req.query('q')?.trim() ?? ''
  if (!q) return c.json({ stations: [] })
  if (!hasTdxCredentials()) return c.json({ error: 'TDX 金鑰未設定' }, 503)

  try {
    const stations = await searchMetroStations(q)
    c.header('Cache-Control', 'public, max-age=3600')
    return c.json({ stations })
  } catch (error) {
    console.error('[transit/stations]', error)
    return c.json({ error: '站點資料暫時無法取得' }, 502)
  }
})

/*
 * 通勤路線。
 *
 * 使用者由 X-User-Ref 標頭識別（identity.ts，不是身分驗證）。
 * 對話裡的 save_commute_route 工具走的是同一層 services/commute.ts，
 * 所以用講的跟用表單設定，存出來的是同一筆資料。
 */

const MODES: TransportMode[] = ['metro', 'bus', 'mixed']

/* 站名長度上限。純粹是防止把任意長字串寫進資料庫，不是業務規則。 */
const MAX_NAME_LENGTH = 60

type ParsedRoute = { origin: string; destination: string; mode: TransportMode; line: string | null }

function parseRouteBody(body: unknown): { ok: true; value: ParsedRoute } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: '請求內容格式錯誤' }
  }

  const { origin, destination, mode, line } = body as Record<string, unknown>

  if (typeof origin !== 'string' || !origin.trim()) {
    return { ok: false, error: 'origin 是必填' }
  }
  if (typeof destination !== 'string' || !destination.trim()) {
    return { ok: false, error: 'destination 是必填' }
  }
  if (origin.trim().length > MAX_NAME_LENGTH || destination.trim().length > MAX_NAME_LENGTH) {
    return { ok: false, error: `站名不能超過 ${MAX_NAME_LENGTH} 個字` }
  }
  if (typeof mode !== 'string' || !MODES.includes(mode as TransportMode)) {
    return { ok: false, error: `mode 必須是 ${MODES.join('、')} 其中之一` }
  }

  return {
    ok: true,
    value: {
      origin: origin.trim(),
      destination: destination.trim(),
      mode: mode as TransportMode,
      /* 沒給就讓 service 從起訖站推，不要在這裡填預設值 */
      line: typeof line === 'string' && line.trim() ? line.trim() : null,
    },
  }
}

app.get('/commute/route', async (c) => {
  const userRef = readUserRef(c.req.header('X-User-Ref'))

  try {
    const route = await readRoute(userRef)
    /* 每個使用者的資料都不一樣，不能讓中間層快取 */
    c.header('Cache-Control', 'private, no-store')
    return c.json({ route })
  } catch (error) {
    console.error('[commute/route:get]', error)
    return c.json({ error: '讀取通勤路線失敗' }, 502)
  }
})

app.post('/commute/route', async (c) => {
  const userRef = readUserRef(c.req.header('X-User-Ref'))

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: '請求內容不是合法的 JSON' }, 400)
  }

  const parsed = parseRouteBody(body)
  if (!parsed.ok) return c.json({ error: parsed.error }, 400)

  try {
    const { route, transferRequired, persisted } = await saveRoute({ userRef, ...parsed.value })
    c.header('Cache-Control', 'private, no-store')
    return c.json({ route, transferRequired, persisted })
  } catch (error) {
    console.error('[commute/route:post]', error)
    return c.json({ error: '儲存通勤路線失敗' }, 502)
  }
})

app.delete('/commute/route', async (c) => {
  const userRef = readUserRef(c.req.header('X-User-Ref'))

  try {
    await clearRoute(userRef)
    return c.body(null, 204)
  } catch (error) {
    console.error('[commute/route:delete]', error)
    return c.json({ error: '刪除通勤路線失敗' }, 502)
  }
})

app.post('/agent/chat', async (c) => {
  const userRef = readUserRef(c.req.header('X-User-Ref'))

  let body: { messages?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: '請求內容不是合法的 JSON' }, 400)
  }

  const result = sanitizeMessages(body.messages)
  if (!result.ok) return c.json({ error: result.error }, 400)

  const messages: ChatMessage[] = result.messages

  /*
   * NDJSON：一行一個 JSON 事件。
   *
   * 原本是純文字串流，但那樣前端只看得到字 —— 模型呼叫 save_commute_route
   * 把路線存好了，畫面卻不知道，要重開 App 才會更新。改成事件流之後，
   * 文字是 {"type":"text"}，狀態改變是 {"type":"commute_route"}。
   * 用換行分隔是安全的：JSON.stringify 會把內容裡的換行跳脫掉。
   */
  const encoder = new TextEncoder()
  const line = (event: unknown) => encoder.encode(`${JSON.stringify(event)}\n`)

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamAgentReplyWithFallback(messages, userRef)) {
          controller.enqueue(line(event))
        }
      } catch (error) {
        // 只記錄在伺服器端，不把內部訊息回給前端
        console.error('[agent/chat]', error)
        controller.enqueue(line({ type: 'error', message: '發生錯誤，請稍後再試' }))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
})
