import type { MiddlewareHandler } from 'hono'

/*
 * 請求驗證的 middleware，所有 routes/ 共用。
 *
 * ── 為什麼不用 hono/validator ──
 * 它沒辦法把兩個型別分開：
 *   In  —— 前端（hc）送出時看到的型別：欄位可以省略、查詢參數一律是字串
 *   Out —— handler 用 c.req.valid() 拿到的、驗證並轉好型別的值
 * 前端拿到的是 In，所以送出時就知道要帶什麼；handler 拿到的是 Out，不用再轉一次。
 * 另外 hono/validator 在 JSON 壞掉時回的是純文字，這裡維持全站一致的 { error }。
 *
 * ── 驗證邏輯本身還是手寫的 ──
 * parse 函式就是原本寫在 handler 開頭的那幾行，錯誤訊息一字未改。
 * 這層只負責「在 handler 之前跑、失敗回 400、成功交給 c.req.valid()」。
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

export const ok = <T>(value: T): Parsed<T> => ({ ok: true, value })
export const fail = (error: string): Parsed<never> => ({ ok: false, error })

/**
 * 查詢參數。parse 拿到的跟 c.req.query() 一樣：同名參數帶兩次時取第一個。
 *
 * In 的值一律是字串 —— URL 上本來就只有字串，數字由 parse 自己轉。
 */
export function query<In extends Record<string, string | undefined>, Out extends object>(
  parse: (query: Record<string, string | undefined>) => Parsed<Out>,
): MiddlewareHandler<any, string, { in: { query: In }; out: { query: Out } }> {
  return async (c, next) => {
    const parsed = parse(c.req.query())
    if (!parsed.ok) return c.json({ error: parsed.error }, 400)

    c.req.addValidatedData('query', parsed.value)
    await next()
  }
}

/**
 * 路徑參數。In 不用指定 —— 前端的型別由路徑本身（/:id）推出來。
 */
export function param<Out extends object>(
  parse: (param: Record<string, string>) => Parsed<Out>,
): MiddlewareHandler<any, string, { out: { param: Out } }> {
  return async (c, next) => {
    const parsed = parse(c.req.param() as Record<string, string>)
    if (!parsed.ok) return c.json({ error: parsed.error }, 400)

    c.req.addValidatedData('param', parsed.value)
    await next()
  }
}

/**
 * JSON body。
 *
 * optional 為 true 時，沒有 body 或 body 不是合法 JSON 都當成 undefined 交給 parse ——
 * 給「不帶 body 也是合法請求」的端點用（例如 /notifications/read 的「全部標已讀」）。
 */
export function json<In, Out extends object>(
  parse: (body: unknown) => Parsed<Out>,
  { optional = false }: { optional?: boolean } = {},
): MiddlewareHandler<any, string, { in: { json: In }; out: { json: Out } }> {
  return async (c, next) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      if (!optional) return c.json({ error: '請求內容不是合法的 JSON' }, 400)
      body = undefined
    }

    const parsed = parse(body)
    if (!parsed.ok) return c.json({ error: parsed.error }, 400)

    c.req.addValidatedData('json', parsed.value)
    await next()
  }
}

/*
 * ── 座標 ──
 * 好幾組路由都收座標，錯誤訊息要一致，所以集中在這裡。
 */

/** 經緯度。用在單一位置（天氣、附近任務、社群日、打卡）。 */
export function parseLatLon(
  rawLat: unknown,
  rawLon: unknown,
): Parsed<{ lat: number; lon: number }> {
  const lat = Number(rawLat)
  const lon = Number(rawLon)

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return fail('lat 與 lon 必須是數字')
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return fail('lat 或 lon 超出合理範圍')
  return ok({ lat, lon })
}

export type FromTo = { fromLat: number; fromLon: number; toLat: number; toLon: number }

/** 起訖兩點。用在交通選項與叫車估價。 */
export function parseFromTo(q: Record<string, string | undefined>): Parsed<FromTo> {
  const fromLat = Number(q.fromLat)
  const fromLon = Number(q.fromLon)
  const toLat = Number(q.toLat)
  const toLon = Number(q.toLon)

  if ([fromLat, fromLon, toLat, toLon].some((n) => !Number.isFinite(n))) {
    return fail('四個座標參數都必須是數字')
  }
  if (Math.abs(fromLat) > 90 || Math.abs(toLat) > 90) return fail('緯度超出合理範圍')
  if (Math.abs(fromLon) > 180 || Math.abs(toLon) > 180) return fail('經度超出合理範圍')
  return ok({ fromLat, fromLon, toLat, toLon })
}

/** 起訖兩點的查詢參數，前端看到的型別 */
export type FromToQuery = { fromLat: string; fromLon: string; toLat: string; toLon: string }
