import { Hono } from 'hono'

import { estimateRide } from '../services/ride.ts'
import { compareTripOptions } from '../services/trip-options.ts'
import { parseFromTo, query, type FromTo, type FromToQuery } from './validate.ts'

const fromToQuery = query<FromToQuery, FromTo>(parseFromTo)

/*
 * 「怎麼去」的選項比較。給探索任務的詳情面板用。
 *
 * 回傳的選項依實際時間排序，叫車固定在最後且不含時間與車資 ——
 * 那兩個數字目前沒有任何資料來源。詳見 services/trip-options.ts。
 */
export const tripRoutes = new Hono().get('/options', fromToQuery, async (c) => {
  const { fromLat, fromLon, toLat, toLon } = c.req.valid('query')

  try {
    const options = await compareTripOptions(fromLat, fromLon, toLat, toLon)
    /* 結果只跟座標有關，可以放心讓用戶端快取 */
    c.header('Cache-Control', 'public, max-age=600')
    return c.json(options, 200)
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
export const rideRoutes = new Hono().get('/estimate', fromToQuery, (c) => {
  const { fromLat, fromLon, toLat, toLon } = c.req.valid('query')

  try {
    const estimate = estimateRide({ lat: fromLat, lon: fromLon }, { lat: toLat, lon: toLon })
    /*
     * 不能久快取：車資與車程跟「現在幾點」有關（尖峰、離峰、夜間加成），
     * 08:00 算出來的估價放到 11:00 就是錯的。抓兩分鐘，跟 /transit/plan 一致。
     */
    c.header('Cache-Control', 'public, max-age=120')
    return c.json(estimate, 200)
  } catch (error) {
    console.error('[ride/estimate]', error)
    return c.json({ error: '車資估算暫時無法取得' }, 502)
  }
})
