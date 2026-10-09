import { Hono } from 'hono'

import { applySchedule } from '../services/metro-schedule.ts'
import { estimateRide } from '../services/ride.ts'
import { planMetroRoutes } from '../services/route-planner.ts'
import {
  findStationPosition,
  getBusStatus,
  getMetroFare,
  getMetroStatus,
  getStationAccessibility,
  hasTdxCredentials,
  isBusCity,
  searchMetroStations,
  type BusCity,
} from '../services/tdx.ts'
import { fail, ok, query, type Parsed } from './validate.ts'

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

/** 必填的文字參數：去頭尾空白後不能是空的 */
function required<K extends string>(key: K, message: string) {
  return (q: Record<string, string | undefined>): Parsed<Record<K, string>> => {
    const value = q[key]?.trim()
    return value ? ok({ [key]: value } as Record<K, string>) : fail(message)
  }
}

type BusQuery = { route: string; city?: string; stop?: string }
type Bus = { route: string; city: BusCity; stop: string | undefined }

function parseBus(q: Record<string, string | undefined>): Parsed<Bus> {
  const route = q.route?.trim()
  const city = q.city?.trim() || 'Taipei'
  const stop = q.stop?.trim() || undefined

  if (!route) return fail('缺少 route 參數')
  if (!isBusCity(city)) return fail(`不支援的縣市代碼「${city}」`)
  return ok({ route, city, stop })
}

type PlanQuery = { from: string; to: string; accessibility?: '1' }
type Plan = { from: string; to: string; accessibility: boolean }

function parsePlan(q: Record<string, string | undefined>): Parsed<Plan> {
  const from = q.from?.trim()
  const to = q.to?.trim()
  if (!from || !to) return fail('缺少 from 或 to 參數')
  return ok({ from, to, accessibility: q.accessibility === '1' })
}

export const transitRoutes = new Hono()
  .get(
    '/metro',
    query<{ line: string }, { line: string }>(required('line', '缺少 line 參數')),
    async (c) => {
      const { line } = c.req.valid('query')
      if (!hasTdxCredentials()) return c.json({ error: 'TDX 金鑰未設定' }, 503)

      try {
        const status = await getMetroStatus(line)
        if (!status) return c.json({ error: `查不到「${line}」這條捷運路線` }, 404)

        c.header('Cache-Control', 'public, max-age=30')
        return c.json(status, 200)
      } catch (error) {
        console.error('[transit/metro]', error)
        return c.json({ error: '捷運即時服務暫時無法取得' }, 502)
      }
    },
  )

  .get('/bus', query<BusQuery, Bus>(parseBus), async (c) => {
    const { route, city, stop } = c.req.valid('query')
    if (!hasTdxCredentials()) return c.json({ error: 'TDX 金鑰未設定' }, 503)

    try {
      const status = await getBusStatus(city, route, stop)
      c.header('Cache-Control', 'public, max-age=30')
      return c.json(status, 200)
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
  .get(
    '/stations',
    query<{ q?: string }, { q: string }>(({ q }) => ok({ q: q?.trim() ?? '' })),
    async (c) => {
      const { q } = c.req.valid('query')
      if (!q) return c.json({ stations: [] }, 200)
      if (!hasTdxCredentials()) return c.json({ error: 'TDX 金鑰未設定' }, 503)

      try {
        const stations = await searchMetroStations(q)
        c.header('Cache-Control', 'public, max-age=3600')
        return c.json({ stations }, 200)
      } catch (error) {
        console.error('[transit/stations]', error)
        return c.json({ error: '站點資料暫時無法取得' }, 502)
      }
    },
  )

  /*
   * 捷運路徑規劃。
   *
   * 路網是靜態資料，服務端建一次圖快取一天，之後每次查詢都是本地計算 ——
   * 所以這支端點不會消耗 TDX 額度，用戶端也可以放心快取久一點。
   */
  .get('/plan', query<PlanQuery, Plan>(parsePlan), async (c) => {
    const { from, to, accessibility: wantsAccessibility } = c.req.valid('query')
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
       * 無障礙資訊只在呼叫端要的時候查。
       *
       * 預設不給是刻意的：這段資訊對需要的人必須是顯眼的，塞進每一次路線查詢
       * 只會讓它變成背景雜訊。前端依使用者的 accessibilityPriority 偏好決定要不要帶。
       *
       * 查的是**轉乘站與出站口**，不是沿途每一站：中途不出站的站有沒有電梯
       * 跟這趟無關，查了只是多幾筆資料要讀。
       */
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

      /*
       * 收班與快收班時附上叫車估價。
       *
       * 這是「末班車倒數」真正的重點：單講「還有 22 分鐘」只是壞消息的預告，
       * 使用者當下要做的決定是「趕不趕得上，趕不上要花多少錢」。
       * 兩份資料都已經在手上，不放在一起講就等於沒講。
       *
       * 營運中的路線不算 —— 那會變成每一次查路線都推一次叫車。
       */
      const needsFallback =
        best.service.status === 'closed' || best.service.status === 'closing-soon'
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
      return c.json(
        {
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
        },
        200,
      )
    } catch (error) {
      console.error('[transit/plan]', error)
      return c.json({ error: '路線規劃暫時無法使用' }, 502)
    }
  })

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
  .get(
    '/station/accessibility',
    query<{ stationId: string }, { stationId: string }>(
      required('stationId', '缺少 stationId 參數'),
    ),
    async (c) => {
      const { stationId } = c.req.valid('query')
      if (!hasTdxCredentials()) return c.json({ error: 'TDX 金鑰未設定' }, 503)

      try {
        const accessibility = await getStationAccessibility(stationId)
        if (!accessibility) {
          return c.json({ error: `站表裡查不到「${stationId}」` }, 404)
        }
        /* 出口資料是靜態的，後端已經快取一天，用戶端也可以放心快取久一點 */
        c.header('Cache-Control', 'public, max-age=86400')
        return c.json(accessibility, 200)
      } catch (error) {
        console.error('[transit/station/accessibility]', error)
        return c.json({ error: '車站設施資料暫時無法取得' }, 502)
      }
    },
  )
