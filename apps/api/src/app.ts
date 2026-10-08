import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { streamAgentReplyWithFallback, type ChatMessage } from './agent/index.ts'
import { sanitizeMessages } from './agent/sanitize.ts'
import { hasDatabase } from './db/client.ts'
import { findNearbyMissions } from './db/repositories/missions.ts'
import { findActiveCommunityDay } from './db/repositories/communityDay.ts'
import { checkInMission, listCompletedMissions } from './db/repositories/userMissions.ts'
import { getPreferences, savePreferences } from './db/repositories/preferences.ts'
import { listNotifications, markRead } from './db/repositories/notifications.ts'
import { readUserRef, USER_REF_PROVIDER } from './identity.ts'
import { commuteRoutes } from './routes/commute.ts'
import { planItinerary } from './services/community-day.ts'
import { applySchedule } from './services/metro-schedule.ts'
import { planMetroRoutes } from './services/route-planner.ts'
import type { UserLocation } from './services/place.ts'
import { estimateRide } from './services/ride.ts'
import { compareTripOptions } from './services/trip-options.ts'
import { pollTransit } from './services/transit-watch.ts'
import {
  findStationPosition,
  getBusStatus,
  getMetroFare,
  getMetroStatus,
  getStationAccessibility,
  hasTdxCredentials,
  isBusCity,
  searchMetroStations,
} from './services/tdx.ts'
import { geocodePlace, getWeather } from './services/weather.ts'

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
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
 * 使用者偏好。
 *
 * 興趣同時存在前端 localStorage（即時的畫面狀態）與這裡（後端輪詢要看得到）。
 * 只有「主動推薦」需要後端那一份 —— 沒有它，反向導流就篩不了興趣。
 */
app.get('/me/preferences', async (c) => {
  const userRef = readUserRef(c.req.header('X-User-Ref'))
  if (!hasDatabase()) {
    return c.json({ interests: [], discoveryEnabled: true, accessibilityPriority: false })
  }

  try {
    const prefs = await getPreferences(userRef, USER_REF_PROVIDER)
    c.header('Cache-Control', 'private, no-store')
    return c.json(prefs)
  } catch (error) {
    console.error('[me/preferences:get]', error)
    return c.json({ error: '讀取偏好失敗' }, 502)
  }
})

app.put('/me/preferences', async (c) => {
  const userRef = readUserRef(c.req.header('X-User-Ref'))

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: '請求內容不是合法的 JSON' }, 400)
  }

  const { interests, discoveryEnabled, accessibilityPriority } = (body ?? {}) as {
    interests?: unknown
    discoveryEnabled?: unknown
    accessibilityPriority?: unknown
  }

  if (interests !== undefined) {
    if (!Array.isArray(interests) || interests.some((i) => typeof i !== 'string')) {
      return c.json({ error: 'interests 必須是字串陣列' }, 400)
    }
    /* 擋住異常長度的輸入寫進資料庫；標籤本來就只有十來個 */
    if (interests.length > 50) return c.json({ error: 'interests 過多' }, 400)
  }
  if (discoveryEnabled !== undefined && typeof discoveryEnabled !== 'boolean') {
    return c.json({ error: 'discoveryEnabled 必須是布林值' }, 400)
  }
  if (accessibilityPriority !== undefined && typeof accessibilityPriority !== 'boolean') {
    return c.json({ error: 'accessibilityPriority 必須是布林值' }, 400)
  }

  /* 沒有資料庫時就是存不了，照實說而不是假裝成功 */
  if (!hasDatabase()) return c.json({ error: '偏好儲存未啟用' }, 503)

  try {
    const saved = await savePreferences(userRef, USER_REF_PROVIDER, {
      interests: interests as string[] | undefined,
      discoveryEnabled: discoveryEnabled as boolean | undefined,
      accessibilityPriority: accessibilityPriority as boolean | undefined,
    })
    return c.json(saved)
  } catch (error) {
    console.error('[me/preferences:put]', error)
    return c.json({ error: '儲存偏好失敗' }, 502)
  }
})

/*
 * 附近的探索任務（地理圍欄）。
 *
 * 查詢走 PostGIS 的 ST_DWithin，吃 001 就建好的 GiST 空間索引，
 * 所以半徑再大也不會變成全表掃描。
 */

/* 半徑上限。再大就不是「附近」了，而且回應會膨脹。 */
const MAX_MISSION_RADIUS_M = 50_000
const DEFAULT_MISSION_RADIUS_M = 3_000

app.get('/missions/nearby', async (c) => {
  const lat = Number(c.req.query('lat'))
  const lon = Number(c.req.query('lon'))
  const radius = Number(c.req.query('radius') ?? DEFAULT_MISSION_RADIUS_M)
  /*
   * 逗號分隔的興趣標籤。探索地圖刻意不帶 —— 那邊要全部拿回來自己變淡，
   * 直接篩掉會讓地圖突然清空。這是給 agent 與清單用的。
   */
  const tags = c.req
    .query('tags')
    ?.split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return c.json({ error: 'lat 與 lon 必須是數字' }, 400)
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return c.json({ error: 'lat 或 lon 超出合理範圍' }, 400)
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    return c.json({ error: 'radius 必須是正數' }, 400)
  }

  /* 沒有資料庫就是沒有任務，回空陣列而不是錯誤 —— 這是輔助內容，不該擋住畫面 */
  if (!hasDatabase()) return c.json({ missions: [] })

  const userRef = readUserRef(c.req.header('X-User-Ref'))

  try {
    const missions = await findNearbyMissions(
      lat,
      lon,
      Math.min(radius, MAX_MISSION_RADIUS_M),
      20,
      tags,
      { provider: USER_REF_PROVIDER, externalRef: userRef },
    )
    /*
     * 任務內容不常變，但「我在不在圍欄裡」會隨位置變，而且現在還帶了
     * 這個人的完成進度 —— 一律 private，不能讓中間層快取。
     * 快取時間也縮短：打卡完成之後要馬上看得到狀態變了。
     */
    c.header('Cache-Control', 'private, max-age=15')
    return c.json({ missions })
  } catch (error) {
    console.error('[missions/nearby]', error)
    return c.json({ error: '任務資料暫時無法取得' }, 502)
  }
})

/*
 * 現在這附近有沒有進行中的社群日，以及一條跑得完的行程。
 *
 * Task.md 的「AR 遊戲行程設計」與「精準導流」就是這支：
 * 把一場活動的多個冷門地點，排成一條有順序的路線，
 * 並在每一段照實說用走的還是值得叫車。
 *
 * ── 「綠色共乘快線」的誠實範圍 ──
 * 字面上的多人共乘媒合**做不到**：沒有登入、沒有即時位置、沒有使用者密度，
 * 三個缺一不可而我們三個都沒有。所以這裡給的是一個人的最佳路線，
 * 外加 participantsToday（今天多少人跑過這場）當熱度。
 * 那個數字是真的，但它**不是**「附近有幾個人可以跟你共乘」。
 *
 * 沒有進行中的活動時回 day: null —— 那是常態，不是錯誤。
 * 一年裡大部分日子都沒有社群日，這支端點絕大多數時候就是回 null。
 */
app.get('/campaigns/today', async (c) => {
  const lat = Number(c.req.query('lat'))
  const lon = Number(c.req.query('lon'))
  const radius = Number(c.req.query('radius') ?? DEFAULT_MISSION_RADIUS_M)

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return c.json({ error: 'lat 與 lon 必須是數字' }, 400)
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return c.json({ error: 'lat 或 lon 超出合理範圍' }, 400)
  }

  /* 沒有資料庫就是沒有活動。這是輔助內容，不該擋住畫面 */
  if (!hasDatabase()) return c.json({ day: null })

  const userRef = readUserRef(c.req.header('X-User-Ref'))

  try {
    const day = await findActiveCommunityDay(
      lat,
      lon,
      Math.min(radius, MAX_MISSION_RADIUS_M),
      { provider: USER_REF_PROVIDER, externalRef: userRef },
    )

    /* 回應含這個人完成了哪些，而且跟「現在幾點」有關，不能讓中間層快取 */
    c.header('Cache-Control', 'private, no-store')
    if (!day) return c.json({ day: null })

    return c.json({ day: planItinerary(day, { lat, lon }) })
  } catch (error) {
    console.error('[campaigns/today]', error)
    return c.json({ error: '活動資料暫時無法取得' }, 502)
  }
})

/*
 * 打卡完成一個任務。
 *
 * ── 判定在伺服器做 ──
 * 前端已經算過「我在不在圍欄裡」（決定按鈕亮不亮），但那個判定不能當授權 ——
 * 任何人都可以直接打這支 API 說自己完成了。所以拿他送來的座標
 * 重新跟 PostGIS 對一次，用任務自己的 radius_meters。
 *
 * ── 但這不是防作弊 ──
 * 座標是前端給的，改得掉。伺服器驗證擋住的是「人在家裡按完成」這種最基本的
 * 情況，擋不住認真偽造 GPS 的人。所以任何地方都不要把打卡講成「已驗證」。
 * 真正的防作弊要裝置簽章與軌跡合理性，那是另一個層級的工程。
 */
app.post('/missions/:id/checkin', async (c) => {
  const userRef = readUserRef(c.req.header('X-User-Ref'))
  const missionId = c.req.param('id')

  /* 明顯不是 uuid 就不要丟給資料庫 —— 那會是一個 22P02 例外而不是 404 */
  if (!/^[0-9a-f-]{36}$/i.test(missionId)) {
    return c.json({ error: '任務 id 格式不正確' }, 400)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: '請求內容不是合法的 JSON' }, 400)
  }

  const { lat, lon } = (body ?? {}) as { lat?: unknown; lon?: unknown }
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return c.json({ error: '需要 lat 與 lon（數字）' }, 400)
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return c.json({ error: 'lat 與 lon 必須是有限的數字' }, 400)
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return c.json({ error: 'lat 或 lon 超出合理範圍' }, 400)
  }

  /* 沒有資料庫就記不住，照實說而不是假裝成功 —— 假裝的話他會以為完成了 */
  if (!hasDatabase()) return c.json({ error: '任務進度儲存未啟用' }, 503)

  try {
    const result = await checkInMission(userRef, USER_REF_PROVIDER, missionId, lat, lon)
    c.header('Cache-Control', 'private, no-store')

    if (result.ok) return c.json(result)

    /*
     * 狀態碼分開，前端才能講出不同的話：
     *   404 這個任務不存在
     *   410 活動結束了 —— 他沒做錯，只是來晚了
     *   422 人不在範圍內 —— 帶上還差幾公尺，這是他唯一能行動的資訊
     */
    const status = result.reason === 'not-found' ? 404 : result.reason === 'closed' ? 410 : 422
    return c.json(result, status)
  } catch (error) {
    console.error('[missions/checkin]', error)
    return c.json({ error: '打卡暫時無法完成' }, 502)
  }
})

/*
 * 這個人完成過的任務。給會員頁與成就用。
 *
 * 沒有資料庫時回空陣列而不是錯誤：那是「還沒完成任何任務」的合理呈現，
 * 而且這是輔助內容，不該擋住整頁。
 */
app.get('/me/missions', async (c) => {
  const userRef = readUserRef(c.req.header('X-User-Ref'))

  if (!hasDatabase()) return c.json({ missions: [] })

  try {
    const missions = await listCompletedMissions(userRef, USER_REF_PROVIDER)
    c.header('Cache-Control', 'private, no-store')
    return c.json({ missions })
  } catch (error) {
    console.error('[me/missions]', error)
    return c.json({ error: '任務紀錄暫時無法取得' }, 502)
  }
})

/*
 * 「怎麼去」的選項比較。給探索任務的詳情面板用。
 *
 * 回傳的選項依實際時間排序，叫車固定在最後且不含時間與車資 ——
 * 那兩個數字目前沒有任何資料來源。詳見 services/trip-options.ts。
 */
app.get('/trip/options', async (c) => {
  const fromLat = Number(c.req.query('fromLat'))
  const fromLon = Number(c.req.query('fromLon'))
  const toLat = Number(c.req.query('toLat'))
  const toLon = Number(c.req.query('toLon'))

  const coords = [fromLat, fromLon, toLat, toLon]
  if (coords.some((n) => !Number.isFinite(n))) {
    return c.json({ error: '四個座標參數都必須是數字' }, 400)
  }
  if (Math.abs(fromLat) > 90 || Math.abs(toLat) > 90) {
    return c.json({ error: '緯度超出合理範圍' }, 400)
  }
  if (Math.abs(fromLon) > 180 || Math.abs(toLon) > 180) {
    return c.json({ error: '經度超出合理範圍' }, 400)
  }

  try {
    const options = await compareTripOptions(fromLat, fromLon, toLat, toLon)
    /* 結果只跟座標有關，可以放心讓用戶端快取 */
    c.header('Cache-Control', 'public, max-age=600')
    return c.json(options)
  } catch (error) {
    console.error('[trip/options]', error)
    return c.json({ error: '交通選項暫時無法取得' }, 502)
  }
})

/*
 * 叫車估價。
 *
 * **不是 yoxi 的報價** —— 依臺北市公告計程車費率估算，公式與理由見
 * services/ride.ts。回傳的 basis 欄位要原封不動顯示在畫面上。
 *
 * 收座標而不是地名：叫車流程的上下車點是使用者在地圖上選的，前端已經有座標了，
 * 再繞一次地理編碼只會多一次往返、而且可能解析到別的地方去。
 * 需要從地名查的情境走 agent 的 estimate_ride 工具。
 */
app.get('/ride/estimate', async (c) => {
  const fromLat = Number(c.req.query('fromLat'))
  const fromLon = Number(c.req.query('fromLon'))
  const toLat = Number(c.req.query('toLat'))
  const toLon = Number(c.req.query('toLon'))

  const coords = [fromLat, fromLon, toLat, toLon]
  if (coords.some((n) => !Number.isFinite(n))) {
    return c.json({ error: '四個座標參數都必須是數字' }, 400)
  }
  if (Math.abs(fromLat) > 90 || Math.abs(toLat) > 90) {
    return c.json({ error: '緯度超出合理範圍' }, 400)
  }
  if (Math.abs(fromLon) > 180 || Math.abs(toLon) > 180) {
    return c.json({ error: '經度超出合理範圍' }, 400)
  }

  try {
    const estimate = estimateRide(
      { lat: fromLat, lon: fromLon },
      { lat: toLat, lon: toLon },
    )
    /*
     * 不能久快取：車資與車程跟「現在幾點」有關（尖峰、離峰、夜間加成），
     * 08:00 算出來的估價放到 11:00 就是錯的。抓兩分鐘，跟 /transit/plan 一致。
     */
    c.header('Cache-Control', 'public, max-age=120')
    return c.json(estimate)
  } catch (error) {
    console.error('[ride/estimate]', error)
    return c.json({ error: '車資估算暫時無法取得' }, 502)
  }
})

/*
 * 地名 → 座標。
 *
 * 給前端的「手動選擇位置」用：定位被拒絕時，使用者總得有辦法告訴我們他在哪。
 * 由後端代打是因為 Nominatim 的使用條款要求可識別的 User-Agent 並限制頻率，
 * 那兩件事在瀏覽器裡都做不到。
 */
app.get('/geocode', async (c) => {
  const q = c.req.query('q')?.trim()
  if (!q) return c.json({ error: '缺少 q 參數' }, 400)
  /* 地名不會有這麼長，擋掉的是把這支端點當成任意轉發的用法 */
  if (q.length > 60) return c.json({ error: 'q 太長' }, 400)

  try {
    const place = await geocodePlace(q)
    if (!place) return c.json({ error: `查不到「${q}」這個地點` }, 404)

    c.header('Cache-Control', 'public, max-age=86400')
    return c.json({ lat: place.lat, lon: place.lon, name: place.shortName })
  } catch (error) {
    console.error('[geocode]', error)
    return c.json({ error: '地點查詢暫時無法使用' }, 502)
  }
})

/*
 * 捷運路徑規劃。
 *
 * 路網是靜態資料，服務端建一次圖快取一天，之後每次查詢都是本地計算 ——
 * 所以這支端點不會消耗 TDX 額度，用戶端也可以放心快取久一點。
 */
app.get('/transit/plan', async (c) => {
  const from = c.req.query('from')?.trim()
  const to = c.req.query('to')?.trim()

  if (!from || !to) return c.json({ error: '缺少 from 或 to 參數' }, 400)
  if (!hasTdxCredentials()) return c.json({ error: 'TDX 金鑰未設定' }, 503)

  try {
    const routes = await planMetroRoutes(from, to)
    if (!routes) return c.json({ error: `查不到「${from}」到「${to}」的捷運路線` }, 404)

    /* 套上「現在幾點」：等車、尖峰、以及此刻還有沒有車 */
    const now = new Date()
    const [best, ...alternatives] = await Promise.all(
      [routes.best, ...routes.alternatives].map((r) => applySchedule(r, now)),
    )

    /*
     * 票價。ODFare 是靜態資料且在 tdx.ts 壓成索引快取一天，
     * 所以這支端點仍然不會因為多了票價而消耗 TDX 額度。
     */
    const first = best.legs[0]
    const last = best.legs[best.legs.length - 1]
    const fare =
      first && last
        ? await getMetroFare(first.fromStationId, last.toStationId).catch((error: unknown) => {
            console.error('[transit/plan] 票價取得失敗：', error)
            return null
          })
        : null

    /*
     * 收班與快收班時附上叫車估價。
     *
     * 這是「末班車倒數」真正的重點：單講「還有 22 分鐘」只是壞消息的預告，
     * 使用者當下要做的決定是「趕不趕得上，趕不上要花多少錢」。
     * 兩份資料都已經在手上，不放在一起講就等於沒講。
     *
     * 營運中的路線不算 —— 那會變成每一次查路線都推一次叫車。
     */
    /*
     * 無障礙資訊只在呼叫端要的時候查。
     *
     * 預設不給是刻意的：這段資訊對需要的人必須是顯眼的，塞進每一次路線查詢
     * 只會讓它變成背景雜訊。前端依使用者的 accessibilityPriority 偏好決定要不要帶。
     *
     * 查的是**轉乘站與出站口**，不是沿途每一站：中途不出站的站有沒有電梯
     * 跟這趟無關，查了只是多幾筆資料要讀。
     */
    const wantsAccessibility = c.req.query('accessibility') === '1'
    const accessibility = wantsAccessibility
      ? await Promise.all(
          /* 轉乘站 = 除了最後一段以外，每一段的終點 */
          best.legs.map((leg, index) => ({
            role: index === best.legs.length - 1 ? ('exit' as const) : ('transfer' as const),
            station: leg.to,
            stationId: leg.toStationId,
          })),
        ).then((points) =>
          Promise.all(
            points.map(async (point) => ({
              ...point,
              /*
               * 查不到就是 null，呼叫端要照實說「查無資料」。
               * 告訴一個坐輪椅的人某個出口有電梯而實際沒有，比不給資訊糟糕得多。
               */
              facility: await getStationAccessibility(point.stationId).catch(
                (error: unknown) => {
                  console.error('[transit/plan] 車站設施取得失敗：', error)
                  return null
                },
              ),
            })),
          ),
        )
      : null

    const needsFallback = best.service.status === 'closed' || best.service.status === 'closing-soon'
    const rideFallback = needsFallback
      ? await Promise.all([findStationPosition(best.from), findStationPosition(best.to)])
          .then(([from, to]) =>
            from && to
              ? estimateRide({ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon }, now)
              : null,
          )
          .catch((error: unknown) => {
            console.error('[transit/plan] 叫車估價失敗：', error)
            return null
          })
      : null

    /*
     * 快取從一小時降到兩分鐘。
     *
     * 這支的回應現在跟時間有關了 —— 00:30 查到的「營運中」放到 01:30 就是錯的，
     * 而那正是最不能講錯的那一種錯。路網圖與班表在伺服器端仍然快取一天，
     * 所以縮短用戶端快取不會多打 TDX。
     */
    c.header('Cache-Control', 'public, max-age=120')

    /*
     * 最佳路線的欄位攤平在最外層，備選另外放一個陣列。
     * 這樣既有的呼叫端（設定畫面的「約 N 分鐘」）不用改就能繼續用，
     * 要顯示備選的畫面再多讀一個欄位。
     *
     * 注意 totalMinutes 的意思變了：現在含依班距估算的等車。
     * 純車程要看 rideMinutes。
     */
    return c.json({
      from: best.from,
      to: best.to,
      totalMinutes: best.totalMinutes,
      rideMinutes: best.rideMinutes,
      waitMinutes: best.waitMinutes,
      transfers: best.transfers,
      legs: best.legs,
      peak: best.peak,
      service: best.service,
      /* 查不到就是 null —— 捷運票價是分段計費的公告值，不要用距離推 */
      fare,
      /* 只有收班／快收班時才有值，理由見上面 */
      rideFallback,
      /* 只有帶 accessibility=1 時才有值；facility 為 null 代表查不到，不是沒有 */
      accessibility,
      alternatives,
    })
  } catch (error) {
    console.error('[transit/plan]', error)
    return c.json({ error: '路線規劃暫時無法使用' }, 502)
  }
})

/*
 * 通勤路線與出發倒數，見 routes/commute.ts。
 *
 * AppType 是給前端 Hono RPC（hc）用的型別。目前只有 /commute 這組改成鏈式寫法、
 * 有完整型別；其他路由要給前端用型別呼叫時，搬成 routes/ 底下的子路由再串到這裡。
 */
const routes = app.route('/commute', commuteRoutes)

export type AppType = typeof routes

/*
 * 車站的無障礙資訊。
 *
 * hasElevator 是三態，呼叫端一定要分得出來：
 *   true  有登錄、而且有電梯出口
 *   false 有登錄、但沒有電梯出口
 *   null  沒有登錄 —— 我們不知道
 *
 * 把 null 顯示成「沒有電梯」是這個功能最糟的失敗方式：
 * 一個坐輪椅的人會因此繞去另一個站，而那一站可能更遠。
 * 反過來把 null 講成「有電梯」更糟 —— 他會走過去，然後卡在那裡。
 */
app.get('/transit/station/accessibility', async (c) => {
  const stationId = c.req.query('stationId')?.trim()
  if (!stationId) return c.json({ error: '缺少 stationId 參數' }, 400)
  if (!hasTdxCredentials()) return c.json({ error: 'TDX 金鑰未設定' }, 503)

  try {
    const accessibility = await getStationAccessibility(stationId)
    if (!accessibility) {
      return c.json({ error: `站表裡查不到「${stationId}」` }, 404)
    }
    /* 出口資料是靜態的，後端已經快取一天，用戶端也可以放心快取久一點 */
    c.header('Cache-Control', 'public, max-age=86400')
    return c.json(accessibility)
  } catch (error) {
    console.error('[transit/station/accessibility]', error)
    return c.json({ error: '車站設施資料暫時無法取得' }, 502)
  }
})

/*
 * 通知收件匣。
 *
 * 內容是由 services/transit-watch.ts 的輪詢主動寫進來的，這裡只負責讀與標記已讀。
 * 未讀數就是這裡算出來的 —— 行程頁鈴鐺上的數字第一次有真實來源。
 */
app.get('/notifications', async (c) => {
  const userRef = readUserRef(c.req.header('X-User-Ref'))

  if (!hasDatabase()) return c.json({ notifications: [], unreadCount: 0 })

  try {
    const result = await listNotifications(userRef, USER_REF_PROVIDER)
    /* 每個人的收件匣都不一樣，不能讓中間層快取 */
    c.header('Cache-Control', 'private, no-store')
    return c.json(result)
  } catch (error) {
    console.error('[notifications:get]', error)
    return c.json({ error: '讀取通知失敗' }, 502)
  }
})

/** 帶 id 就標那一則，不帶就全部標成已讀 */
app.post('/notifications/read', async (c) => {
  const userRef = readUserRef(c.req.header('X-User-Ref'))

  if (!hasDatabase()) return c.json({ marked: 0 })

  let id: string | undefined
  /* 沒有 body 是合法的（= 全部標已讀），所以解析失敗不算錯誤 */
  const body = (await c.req.json().catch(() => null)) as { id?: unknown } | null
  if (body && typeof body.id === 'string') {
    if (!/^[0-9a-f-]{36}$/i.test(body.id)) return c.json({ error: 'id 格式錯誤' }, 400)
    id = body.id
  }

  try {
    const marked = await markRead(userRef, USER_REF_PROVIDER, id)
    return c.json({ marked })
  } catch (error) {
    console.error('[notifications:read]', error)
    return c.json({ error: '標記已讀失敗' }, 502)
  }
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
app.post('/internal/poll', async (c) => {
  const token = process.env.POLL_TOKEN
  if (!token) return c.json({ error: 'Not Found' }, 404)
  if (c.req.header('X-Poll-Token') !== token) return c.json({ error: '未授權' }, 401)

  const result = await pollTransit()
  return c.json(result)
})

/*
 * 前端帶進來的定位。
 *
 * 座標不合法就當作沒有位置 —— 寧可讓畫面跳出「開啟定位」的卡片，
 * 也不要拿一個錯的座標去規劃，那會回一條看起來很正常但完全錯誤的路線。
 *
 * label 是前端已經知道的地名，純粹省一次反向地理編碼。它會進到系統提示裡，
 * 所以長度要有上限（agent/index.ts 還會再清一次換行）。
 */
const MAX_LOCATION_LABEL = 80

function parseLocation(value: unknown): UserLocation | null {
  if (typeof value !== 'object' || value === null) return null
  const o = value as Record<string, unknown>

  const lat = Number(o.lat)
  const lon = Number(o.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null

  const label =
    typeof o.label === 'string' && o.label.trim()
      ? o.label.trim().slice(0, MAX_LOCATION_LABEL)
      : null

  return { lat, lon, precise: o.precise === true, label }
}

app.post('/agent/chat', async (c) => {
  const userRef = readUserRef(c.req.header('X-User-Ref'))

  let body: { messages?: unknown; location?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: '請求內容不是合法的 JSON' }, 400)
  }

  const result = sanitizeMessages(body.messages)
  if (!result.ok) return c.json({ error: result.error }, 400)

  const messages: ChatMessage[] = result.messages
  const location = parseLocation(body.location)

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
        for await (const event of streamAgentReplyWithFallback(messages, userRef, location)) {
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
