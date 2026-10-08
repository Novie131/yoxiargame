import { Hono, type MiddlewareHandler } from 'hono'
import { validator } from 'hono/validator'

import {
  DEFAULT_ROUTE_LABEL,
  isRouteLabel,
  ROUTE_LABELS,
  type RouteLabel,
  type TransportMode,
} from '../db/repositories/commute.ts'
import { readUserRef } from '../identity.ts'
import {
  clearRoute,
  readRoute,
  readRoutes,
  saveRoute,
  setNotifications,
} from '../services/commute.ts'
import { planDeparture } from '../services/departure.ts'
import { isBusCity } from '../services/tdx.ts'

/*
 * 通勤路線。
 *
 * 使用者由 X-User-Ref 標頭識別（identity.ts，不是身分驗證）。
 * 對話裡的 save_commute_route 工具走的是同一層 services/commute.ts，
 * 所以用講的跟用表單設定，存出來的是同一筆資料。
 *
 * ── 為什麼路由要串成一條鏈 ──
 * 前端用 Hono RPC（hc）呼叫這裡，型別是從 `typeof commuteRoutes` 推出來的。
 * 只有 `.get().post()...` 串起來的寫法型別才會累積；拆成一行一個 `app.get(...)`
 * 的話，前端拿到的型別是空的，而且不會有任何錯誤提醒你。
 */

const MODES: TransportMode[] = ['metro', 'bus', 'mixed']

/* 站名長度上限。純粹是防止把任意長字串寫進資料庫，不是業務規則。 */
const MAX_NAME_LENGTH = 60

type ParsedRoute = {
  origin: string
  destination: string
  mode: TransportMode
  line: string | null
  city: string | null
  usualDays: string[]
  usualTimeStart: string | null
  usualTimeEnd: string | null
  arriveBy: string | null
}

/**
 * 前端送出路線時的形狀。跟 ParsedRoute 不同的是欄位大多可以省略 ——
 * 省略的值由 parseRouteBody 補預設，前端不用知道預設是什麼。
 */
export type RouteBody = {
  origin: string
  destination: string
  mode: TransportMode
  /** 使用者自己指定的路線名；沒給就由後端從起訖站推 */
  line?: string | null
  /** TDX 城市代碼。公車必要，捷運不用。 */
  city?: string | null
  /** 空陣列 = 每天 */
  usualDays?: string[]
  /** 兩個必須成對給，只給一邊會回 400 */
  usualTimeStart?: string | null
  usualTimeEnd?: string | null
  /** 幾點要到目的地（HH:MM）。跟上面那兩個無關，可以單獨給。 */
  arriveBy?: string | null
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const LABEL_ERROR = `label 必須是 ${ROUTE_LABELS.join('、')} 其中之一`

/** 同一個參數帶兩次時 Hono 給的是陣列，跟 c.req.query() 一樣取第一個 */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/*
 * 路線的 label 從查詢參數讀，沒給就是上班那條。
 *
 * 值不合法時**不要**默默退回預設 —— 使用者以為自己在改回家那條，
 * 結果改掉了上班那條，而畫面上完全看不出來。照實回 400。
 */
const labelQuery = validator('query', (query, c) => {
  const value = first(query.label)
  if (value === undefined || value === '') return { label: DEFAULT_ROUTE_LABEL }
  if (!isRouteLabel(value)) return c.json({ error: LABEL_ERROR }, 400)
  return { label: value }
})

/* 讀取用：不帶 label 是「全部」，所以不補預設；帶了空字串則照舊視為不合法 */
const optionalLabelQuery = validator('query', (query, c): { label?: RouteLabel } | Response => {
  const value = first(query.label)
  if (value === undefined) return {}
  if (!isRouteLabel(value)) return c.json({ error: LABEL_ERROR }, 400)
  return { label: value }
})

/*
 * JSON body 驗證。
 *
 * 不用 hono/validator 的 'json'，因為它沒辦法把兩個型別分開：
 *   In  —— 前端（hc）送出時看到的型別，欄位可以省略
 *   Out —— handler 用 c.req.valid('json') 拿到的、補過預設值的型別
 * 另外它在 JSON 壞掉時回的是純文字，這裡維持原本的 { error } 格式。
 */
function jsonBody<In, Out extends object>(
  parse: (body: unknown) => Parsed<Out>,
): MiddlewareHandler<any, string, { in: { json: In }; out: { json: Out } }> {
  return async (c, next) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: '請求內容不是合法的 JSON' }, 400)
    }

    const parsed = parse(body)
    if (!parsed.ok) return c.json({ error: parsed.error }, 400)

    c.req.addValidatedData('json', parsed.value)
    await next()
  }
}

/* 星期用小寫三字母，跟 Intl 的 weekday: 'short' 對齊，transit-watch 直接比對 */
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function parseDays(value: unknown): string[] | null {
  /* 沒給就是空陣列 = 每天 */
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return null

  const days = [...new Set(value)]
  if (days.some((d) => typeof d !== 'string' || !DAYS.includes(d))) return null
  /* 依週序排好再存，之後顯示或比對都不用再排一次 */
  return DAYS.filter((d) => days.includes(d))
}

function parseTime(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) return undefined
  return value
}

function parseRouteBody(body: unknown): Parsed<ParsedRoute> {
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

  const { city, usualDays, usualTimeStart, usualTimeEnd, arriveBy } = body as Record<
    string,
    unknown
  >

  /* 公車的城市代碼要對得上 TDX，打錯的話之後查不到任何東西且不會有錯誤 */
  if (city !== undefined && city !== null && city !== '') {
    if (typeof city !== 'string' || !isBusCity(city)) {
      return { ok: false, error: `不支援的縣市代碼「${String(city)}」` }
    }
  }

  const days = parseDays(usualDays)
  if (days === null) {
    return { ok: false, error: `usualDays 只接受 ${DAYS.join('、')}` }
  }

  const start = parseTime(usualTimeStart)
  const end = parseTime(usualTimeEnd)
  if (start === undefined || end === undefined) {
    return { ok: false, error: '時間格式必須是 HH:MM（24 小時制）' }
  }
  /*
   * 只給一邊沒有意義 —— 「從 08:00 開始通知」到什麼時候？
   * 與其自己補一個結束時間，不如要求成對，讓意圖是明確的。
   */
  if ((start === null) !== (end === null)) {
    return { ok: false, error: 'usualTimeStart 與 usualTimeEnd 必須成對提供' }
  }

  /*
   * 「幾點要到」是獨立的一個欄位，不跟通知時段成對 ——
   * 兩者語意不同，理由見 008 migration 的註解。
   */
  const arrive = parseTime(arriveBy)
  if (arrive === undefined) {
    return { ok: false, error: 'arriveBy 格式必須是 HH:MM（24 小時制）' }
  }

  return {
    ok: true,
    value: {
      origin: origin.trim(),
      destination: destination.trim(),
      mode: mode as TransportMode,
      /* 沒給就讓 service 從起訖站推，不要在這裡填預設值 */
      line: typeof line === 'string' && line.trim() ? line.trim() : null,
      city: typeof city === 'string' && city.trim() ? city.trim() : null,
      usualDays: days,
      usualTimeStart: start,
      usualTimeEnd: end,
      arriveBy: arrive,
    },
  }
}

function parseNotificationBody(body: unknown): Parsed<{ notificationEnabled: boolean }> {
  const { notificationEnabled } = (body ?? {}) as { notificationEnabled?: unknown }
  if (typeof notificationEnabled !== 'boolean') {
    return { ok: false, error: 'notificationEnabled 必須是布林值' }
  }
  return { ok: true, value: { notificationEnabled } }
}

export const commuteRoutes = new Hono()
  /*
   * 讀路線。
   *
   * 不帶 label 時回傳全部（上班那條在前），帶了就只回那一條。
   * `route` 這個欄位保留著且永遠是上班那條 —— 既有的呼叫端不用改就能繼續用，
   * 要顯示兩條的畫面讀 `routes`。
   */
  .get('/route', optionalLabelQuery, async (c) => {
    const userRef = readUserRef(c.req.header('X-User-Ref'))
    const { label: requested } = c.req.valid('query')

    try {
      /* 每個使用者的資料都不一樣，不能讓中間層快取 */
      c.header('Cache-Control', 'private, no-store')

      if (requested) {
        const route = await readRoute(userRef, requested)
        return c.json({ route, routes: route ? [route] : [] }, 200)
      }

      const routes = await readRoutes(userRef)
      return c.json(
        {
          route: routes.find((r) => r.label === DEFAULT_ROUTE_LABEL) ?? null,
          routes,
        },
        200,
      )
    } catch (error) {
      console.error('[commute/route:get]', error)
      return c.json({ error: '讀取通勤路線失敗' }, 502)
    }
  })

  .post('/route', labelQuery, jsonBody<RouteBody, ParsedRoute>(parseRouteBody), async (c) => {
    const userRef = readUserRef(c.req.header('X-User-Ref'))
    const { label } = c.req.valid('query')

    try {
      const { route, transferRequired, persisted } = await saveRoute({
        userRef,
        ...c.req.valid('json'),
        label,
      })
      c.header('Cache-Control', 'private, no-store')
      return c.json({ route, transferRequired, persisted }, 200)
    } catch (error) {
      console.error('[commute/route:post]', error)
      return c.json({ error: '儲存通勤路線失敗' }, 502)
    }
  })

  /*
   * 局部更新。目前只支援開關通知 —— 起訖站要改的話走 POST 整筆覆寫，
   * 因為那會連帶重推路線名，不是單純改一個欄位。
   */
  .patch(
    '/route',
    labelQuery,
    jsonBody<{ notificationEnabled: boolean }, { notificationEnabled: boolean }>(
      parseNotificationBody,
    ),
    async (c) => {
      const userRef = readUserRef(c.req.header('X-User-Ref'))
      const { label } = c.req.valid('query')
      const { notificationEnabled } = c.req.valid('json')

      try {
        const route = await setNotifications(userRef, notificationEnabled, label)
        /* 還沒設定路線就沒有東西可以開關，照實回 404，不要假裝成功 */
        if (!route) return c.json({ error: '尚未設定通勤路線' }, 404)

        c.header('Cache-Control', 'private, no-store')
        return c.json({ route }, 200)
      } catch (error) {
        console.error('[commute/route:patch]', error)
        return c.json({ error: '更新通知設定失敗' }, 502)
      }
    },
  )

  .delete('/route', labelQuery, async (c) => {
    const userRef = readUserRef(c.req.header('X-User-Ref'))
    const { label } = c.req.valid('query')

    try {
      await clearRoute(userRef, label)
      return c.body(null, 204)
    } catch (error) {
      console.error('[commute/route:delete]', error)
      return c.json({ error: '刪除通勤路線失敗' }, 502)
    }
  })

  /*
   * 出發倒數。
   *
   * 只有設定過「幾點要到」的路線才有東西可回 —— 沒有那個錨點就沒有倒數，
   * 這時候回 departure: null，畫面退回「現在出發約 N 分鐘」。
   * 那個退路本身是對的，不要為了讓這支端點有回應而編一個抵達時間。
   */
  .get('/departure', labelQuery, async (c) => {
    const userRef = readUserRef(c.req.header('X-User-Ref'))
    const { label } = c.req.valid('query')

    try {
      const route = await readRoute(userRef, label)
      /* 每個使用者不一樣，而且跟「現在幾點」有關，不能讓中間層快取 */
      c.header('Cache-Control', 'private, no-store')

      if (!route) return c.json({ error: '尚未設定這條路線' }, 404)
      if (!route.arriveBy) return c.json({ route, departure: null }, 200)
      /* 公車沒有路網圖可以規劃，倒數算不出來 —— 照實說，不要用捷運的數字頂替 */
      if (route.mode === 'bus') return c.json({ route, departure: null }, 200)

      const departure = await planDeparture({
        origin: route.origin,
        destination: route.destination,
        arriveBy: route.arriveBy,
      })
      return c.json({ route, departure }, 200)
    } catch (error) {
      console.error('[commute/departure]', error)
      return c.json({ error: '出發倒數暫時無法計算' }, 502)
    }
  })
