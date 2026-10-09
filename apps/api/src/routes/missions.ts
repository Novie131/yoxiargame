import { Hono } from 'hono'

import { hasDatabase } from '../db/client.ts'
import { findNearbyMissions } from '../db/repositories/missions.ts'
import { checkInMission } from '../db/repositories/userMissions.ts'
import { readUserRef, USER_REF_PROVIDER } from '../identity.ts'
import { fail, json, ok, param, parseLatLon, query, type Parsed } from './validate.ts'

/*
 * 附近的探索任務（地理圍欄）。
 *
 * 查詢走 PostGIS 的 ST_DWithin，吃 001 就建好的 GiST 空間索引，
 * 所以半徑再大也不會變成全表掃描。
 */

/* 半徑上限。再大就不是「附近」了，而且回應會膨脹。社群日（routes/campaigns.ts）共用。 */
export const MAX_MISSION_RADIUS_M = 50_000
export const DEFAULT_MISSION_RADIUS_M = 3_000

type NearbyQuery = { lat: string; lon: string; radius?: string; tags?: string }
type Nearby = { lat: number; lon: number; radius: number; tags: string[] | undefined }

function parseNearby(q: Record<string, string | undefined>): Parsed<Nearby> {
  const position = parseLatLon(q.lat, q.lon)
  if (!position.ok) return position

  const radius = Number(q.radius ?? DEFAULT_MISSION_RADIUS_M)
  if (!Number.isFinite(radius) || radius <= 0) return fail('radius 必須是正數')

  /*
   * 逗號分隔的興趣標籤。探索地圖刻意不帶 —— 那邊要全部拿回來自己變淡，
   * 直接篩掉會讓地圖突然清空。這是給 agent 與清單用的。
   */
  const tags = q.tags
    ?.split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  return ok({ ...position.value, radius, tags })
}

/* 明顯不是 uuid 就不要丟給資料庫 —— 那會是一個 22P02 例外而不是 404 */
function parseMissionId({ id }: Record<string, string>): Parsed<{ id: string }> {
  return /^[0-9a-f-]{36}$/i.test(id) ? ok({ id }) : fail('任務 id 格式不正確')
}

type CheckInBody = { lat: number; lon: number }

function parseCheckIn(body: unknown): Parsed<CheckInBody> {
  const { lat, lon } = (body ?? {}) as { lat?: unknown; lon?: unknown }
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return fail('需要 lat 與 lon（數字）')
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return fail('lat 與 lon 必須是有限的數字')
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return fail('lat 或 lon 超出合理範圍')
  }
  return ok({ lat, lon })
}

export const missionRoutes = new Hono()
  .get('/nearby', query<NearbyQuery, Nearby>(parseNearby), async (c) => {
    const { lat, lon, radius, tags } = c.req.valid('query')

    /* 沒有資料庫就是沒有任務，回空陣列而不是錯誤 —— 這是輔助內容，不該擋住畫面 */
    if (!hasDatabase()) return c.json({ missions: [] }, 200)

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
      return c.json({ missions }, 200)
    } catch (error) {
      console.error('[missions/nearby]', error)
      return c.json({ error: '任務資料暫時無法取得' }, 502)
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
  .post(
    '/:id/checkin',
    param(parseMissionId),
    json<CheckInBody, CheckInBody>(parseCheckIn),
    async (c) => {
      const userRef = readUserRef(c.req.header('X-User-Ref'))
      const { id: missionId } = c.req.valid('param')
      const { lat, lon } = c.req.valid('json')

      /* 沒有資料庫就記不住，照實說而不是假裝成功 —— 假裝的話他會以為完成了 */
      if (!hasDatabase()) return c.json({ error: '任務進度儲存未啟用' }, 503)

      try {
        const result = await checkInMission(userRef, USER_REF_PROVIDER, missionId, lat, lon)
        c.header('Cache-Control', 'private, no-store')

        if (result.ok) return c.json(result, 200)

        /*
         * 狀態碼分開，前端才能講出不同的話：
         *   404 這個任務不存在
         *   410 活動結束了 —— 他沒做錯，只是來晚了
         *   422 人不在範圍內 —— 帶上還差幾公尺，這是他唯一能行動的資訊
         */
        const status =
          result.reason === 'not-found' ? 404 : result.reason === 'closed' ? 410 : 422
        return c.json(result, status)
      } catch (error) {
        console.error('[missions/checkin]', error)
        return c.json({ error: '打卡暫時無法完成' }, 502)
      }
    },
  )
