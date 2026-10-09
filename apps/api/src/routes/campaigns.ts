import { Hono } from 'hono'

import { hasDatabase } from '../db/client.ts'
import { findActiveCommunityDay } from '../db/repositories/communityDay.ts'
import { readUserRef, USER_REF_PROVIDER } from '../identity.ts'
import { planItinerary } from '../services/community-day.ts'
import { DEFAULT_MISSION_RADIUS_M, MAX_MISSION_RADIUS_M } from './missions.ts'
import { ok, parseLatLon, query, type Parsed } from './validate.ts'

type TodayQuery = { lat: string; lon: string; radius?: string }
type Today = { lat: number; lon: number; radius: number }

/* radius 這支不檢查是不是正數（/missions/nearby 有），維持它原本的行為 */
function parseToday(q: Record<string, string | undefined>): Parsed<Today> {
  const position = parseLatLon(q.lat, q.lon)
  if (!position.ok) return position
  return ok({ ...position.value, radius: Number(q.radius ?? DEFAULT_MISSION_RADIUS_M) })
}

export const campaignRoutes = new Hono()
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
  .get('/today', query<TodayQuery, Today>(parseToday), async (c) => {
    const { lat, lon, radius } = c.req.valid('query')

    /* 沒有資料庫就是沒有活動。這是輔助內容，不該擋住畫面 */
    if (!hasDatabase()) return c.json({ day: null }, 200)

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
      if (!day) return c.json({ day: null }, 200)

      return c.json({ day: planItinerary(day, { lat, lon }) }, 200)
    } catch (error) {
      console.error('[campaigns/today]', error)
      return c.json({ error: '活動資料暫時無法取得' }, 502)
    }
  })
