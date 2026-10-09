import { Hono } from 'hono'

import { geocodePlace, getWeather } from '../services/weather.ts'
import { fail, ok, parseLatLon, query, type Parsed } from './validate.ts'

/*
 * 跟「某個地方」有關、但不屬於交通的查詢：天氣與地名查座標。
 * 兩支都是代打外部服務（Open-Meteo、Nominatim），路徑掛在根目錄。
 */

type LatLonQuery = { lat: string; lon: string }

function parseGeocode({ q: raw }: Record<string, string | undefined>): Parsed<{ q: string }> {
  const q = raw?.trim()
  if (!q) return fail('缺少 q 參數')
  /* 地名不會有這麼長，擋掉的是把這支端點當成任意轉發的用法 */
  if (q.length > 60) return fail('q 太長')
  return ok({ q })
}

export const placeRoutes = new Hono()
  /*
   * 首頁標題列的即時天氣。前端傳定位座標進來，這裡代打外部 API：
   * 瀏覽器不用直接連第三方（省掉 CORS 與之後換資料來源的麻煩），
   * 而且回應在伺服器端有快取，不會每次開 App 都打一次。
   */
  .get(
    '/weather',
    query<LatLonQuery, { lat: number; lon: number }>((q) => parseLatLon(q.lat, q.lon)),
    async (c) => {
      const { lat, lon } = c.req.valid('query')

      try {
        const weather = await getWeather(lat, lon)
        /* 用戶端也快取幾分鐘，切分頁回來不用重打 */
        c.header('Cache-Control', 'public, max-age=300')
        return c.json(weather, 200)
      } catch (error) {
        console.error('[weather]', error)
        return c.json({ error: '天氣服務暫時無法取得' }, 502)
      }
    },
  )

  /*
   * 地名 → 座標。
   *
   * 給前端的「手動選擇位置」用：定位被拒絕時，使用者總得有辦法告訴我們他在哪。
   * 由後端代打是因為 Nominatim 的使用條款要求可識別的 User-Agent 並限制頻率，
   * 那兩件事在瀏覽器裡都做不到。
   */
  .get('/geocode', query<{ q: string }, { q: string }>(parseGeocode), async (c) => {
    const { q } = c.req.valid('query')

    try {
      const place = await geocodePlace(q)
      if (!place) return c.json({ error: `查不到「${q}」這個地點` }, 404)

      c.header('Cache-Control', 'public, max-age=86400')
      return c.json({ lat: place.lat, lon: place.lon, name: place.shortName }, 200)
    } catch (error) {
      console.error('[geocode]', error)
      return c.json({ error: '地點查詢暫時無法使用' }, 502)
    }
  })
