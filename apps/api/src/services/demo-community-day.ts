import { withTransaction } from '../db/client.ts'
import { geocodePlace } from './weather.ts'

/*
 * 一場社群日的示範資料。
 *
 * 用途：`/campaigns/today` 與探索頁的社群日卡片在沒有活動時回 null ——
 * 那是**正確**的（一年裡大部分日子都沒有社群日），但也代表 demo 看不到東西。
 * 這裡造一場「從現在開始、持續幾小時」的活動出來。
 *
 * 兩種用法：
 *   seedDemoCommunityDay     整場砍掉重建（scripts/seed-community-day.ts，手動重置用）
 *   ensureDemoCommunityDay   本機 API 啟動時與之後定時呼叫（src/index.ts），
 *                            讓這場活動自己一直「進行中」，不用每次 demo 前手動跑 seed
 *
 * 跟 seed-missions.ts 同樣的原則：
 *   座標一律地理編碼查出來，不手寫（圍欄半徑只有 200-300 公尺，手寫會失準）
 *   這是開發用資料，不是 migration —— 正式活動應該由後台建立
 *
 * 地點刻意集中在大安／信義一帶、彼此相距幾百公尺到幾公里，
 * 這樣行程規劃才排得出「有些段走路、有些段值得叫車」的混合結果。
 *
 * 要整場停掉：本機 API 用 DEMO_COMMUNITY_DAY=0 啟動，再刪掉這場活動
 * （先刪它的 missions 再刪 campaign —— missions 的外鍵沒有 ON DELETE CASCADE）。
 */

export const DEMO_CAMPAIGN = 'yoxi 社群日・大安信義'

/* 活動長度。社群日通常是一個下午，三小時是常見的長度。 */
const DURATION_HOURS = 3

/*
 * 剩不到這麼久就往後延。延長時一次延回 DURATION_HOURS，
 * 所以卡片上的「剩 N 小時」會停在 2–3 小時之間，不會出現「剩 5 分」然後消失。
 */
const EXTEND_WHEN_MINUTES_LEFT = 60

/*
 * 觸發半徑。比常設任務（200m）大一些 ——
 * 社群日是人多、移動快的場合，太小的圍欄會讓人站在門口卻打不到卡。
 */
const RADIUS_METERS = 300

const PLACES: Array<{ name: string; tags: string[] }> = [
  { name: '大安森林公園', tags: ['sport', 'photo'] },
  { name: '臺北市信義區象山親山步道', tags: ['sport', 'photo', 'travel'] },
  { name: '四四南村', tags: ['coffee', 'photo', 'food'] },
  { name: '松山文創園區', tags: ['tech', 'reading', 'photo'] },
  { name: '華山1914文化創意產業園區', tags: ['photo', 'movie', 'coffee'] },
]

/* 臺北時間今天的午夜（timestamptz）。兩個 AT TIME ZONE 的理由見 repositories/communityDay.ts */
const TAIPEI_MIDNIGHT = `(date_trunc('day', now() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei')`

/**
 * 整場砍掉重建：重新查座標、清掉所有人的完成紀錄。
 * 回傳建了幾個任務點；一個地點都查不到時丟錯，不建空活動。
 */
export async function seedDemoCommunityDay(log: (line: string) => void = () => {}): Promise<number> {
  /* 先查座標。查不到的就跳過並回報，不要塞一個猜的進資料庫。 */
  const located: Array<{ name: string; tags: string[]; lat: number; lon: number }> = []
  for (const place of PLACES) {
    const found = await geocodePlace(place.name).catch(() => null)
    if (!found) {
      log(`  ✗ 查不到座標，略過：${place.name}`)
      continue
    }
    located.push({ ...place, lat: found.lat, lon: found.lon })
    log(`  ✓ ${place.name}（${found.lat.toFixed(5)}, ${found.lon.toFixed(5)}）`)
  }

  if (located.length === 0) throw new Error('一個地點都查不到，沒有建立活動')

  await withTransaction(async (client) => {
    /*
     * 同名的舊活動先清掉再建，才能重複執行。
     * 先刪 missions：它對 campaigns 的外鍵沒有 CASCADE，順序反了會被擋
     * （完成紀錄 user_missions 對 missions 有 CASCADE，會一起清掉）。
     */
    await client.query(
      `DELETE FROM missions WHERE campaign_id IN
         (SELECT id FROM campaigns WHERE name = $1)`,
      [DEMO_CAMPAIGN],
    )
    await client.query('DELETE FROM campaigns WHERE name = $1', [DEMO_CAMPAIGN])

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO campaigns (name, status, kind, starts_at, ends_at)
       VALUES ($1, 'active', 'community-day', now(), now() + ($2 || ' hours')::interval)
       RETURNING id`,
      [DEMO_CAMPAIGN, String(DURATION_HOURS)],
    )
    const campaignId = rows[0].id

    for (const place of located) {
      await client.query(
        `INSERT INTO missions (campaign_id, name, location, radius_meters, tags)
         VALUES ($1, $2, $3::geography, $4, $5)`,
        [
          campaignId,
          place.name,
          `SRID=4326;POINT(${place.lon} ${place.lat})`,
          RADIUS_METERS,
          place.tags,
        ],
      )
    }
  })

  return located.length
}

/**
 * 讓示範活動保持「進行中」。沒事做時什麼都不動，可以放心定時呼叫。
 *
 *   還沒有這場活動   建一場（要查座標，只有第一次）
 *   換日了           同一場重新開始：時間從現在起算，**清掉昨天的完成紀錄**——
 *                    前一晚彩排打過卡，隔天 demo 不該一打開就全部完成
 *   快結束了         只延長結束時間，今天的進度留著（demo 到一半不會被歸零）
 *
 * 回傳做了什麼，給呼叫端記 log。
 */
export async function ensureDemoCommunityDay(): Promise<'created' | 'restarted' | 'extended' | null> {
  const state = await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string; new_day: boolean; ending: boolean }>(
      `SELECT id,
              starts_at < ${TAIPEI_MIDNIGHT} AS new_day,
              ends_at < now() + ($2 || ' minutes')::interval AS ending
         FROM campaigns
        WHERE name = $1
        LIMIT 1`,
      [DEMO_CAMPAIGN, String(EXTEND_WHEN_MINUTES_LEFT)],
    )
    const campaign = rows[0]
    if (!campaign) return 'missing' as const

    if (campaign.new_day) {
      await client.query(
        `DELETE FROM user_missions
          WHERE mission_id IN (SELECT id FROM missions WHERE campaign_id = $1)`,
        [campaign.id],
      )
      await client.query(
        `UPDATE campaigns
            SET status = 'active', starts_at = now(), ends_at = now() + ($2 || ' hours')::interval
          WHERE id = $1`,
        [campaign.id, String(DURATION_HOURS)],
      )
      return 'restarted' as const
    }

    if (campaign.ending) {
      await client.query(
        `UPDATE campaigns
            SET status = 'active', ends_at = now() + ($2 || ' hours')::interval
          WHERE id = $1`,
        [campaign.id, String(DURATION_HOURS)],
      )
      return 'extended' as const
    }

    return null
  })

  if (state !== 'missing') return state
  await seedDemoCommunityDay()
  return 'created'
}
