import { closeDb, hasDatabase, withTransaction } from '../src/db/client.ts'
import { geocodePlace } from '../src/services/weather.ts'

/*
 * 一場社群日的示範資料。
 *
 * 用途：`/campaigns/today` 與探索頁的社群日卡片在沒有活動時回 null ——
 * 那是**正確**的（一年裡大部分日子都沒有社群日），但也代表 demo 看不到東西。
 * 這支造一場「從現在開始、持續幾小時」的活動出來。
 *
 * 跟 seed-missions.ts 同樣的原則：
 *   座標一律地理編碼查出來，不手寫（圍欄半徑只有 200-300 公尺，手寫會失準）
 *   這是開發用資料，不是 migration —— 正式活動應該由後台建立
 *
 * 地點刻意集中在大安／信義一帶、彼此相距幾百公尺到一公里多，
 * 這樣行程規劃才排得出「有些段走路、有些段值得叫車」的混合結果。
 *
 * 執行：npm --prefix apps/api run seed:community-day
 * 清除：DELETE FROM campaigns WHERE kind = 'community-day';（missions 會連帶刪掉）
 */

const CAMPAIGN = 'yoxi 社群日・大安信義'

/* 活動長度。社群日通常是一個下午，三小時是常見的長度。 */
const DURATION_HOURS = 3

/*
 * 觸發半徑。比常設任務（200m）大一些 ——
 * 社群日是人多、移動快的場合，太小的圍欄會讓人站在門口卻打不到卡。
 */
const RADIUS_METERS = 300

const PLACES: Array<{ name: string; tags: string[] }> = [
  { name: '大安森林公園', tags: ['sport', 'photo'] },
  { name: '臺北市信義區象山親山步道', tags: ['sport', 'photo', 'travel'] },
  { name: '四四南村', tags: ['coffee', 'photo', 'food'] },
  { name: '國立臺灣科學教育館', tags: ['tech', 'reading'] },
  { name: '華山1914文化創意產業園區', tags: ['photo', 'movie', 'coffee'] },
]

async function main() {
  if (!hasDatabase()) {
    console.error('沒有設定 DATABASE_URL，無法寫入')
    process.exitCode = 1
    return
  }

  /* 先查座標。查不到的就跳過並回報，不要塞一個猜的進資料庫。 */
  const located: Array<{ name: string; tags: string[]; lat: number; lon: number }> = []
  for (const place of PLACES) {
    const found = await geocodePlace(place.name).catch(() => null)
    if (!found) {
      console.warn(`  ✗ 查不到座標，略過：${place.name}`)
      continue
    }
    located.push({ ...place, lat: found.lat, lon: found.lon })
    console.log(`  ✓ ${place.name}（${found.lat.toFixed(5)}, ${found.lon.toFixed(5)}）`)
  }

  if (located.length === 0) {
    console.error('一個地點都查不到，沒有建立活動')
    process.exitCode = 1
    return
  }

  await withTransaction(async (client) => {
    /*
     * 同名的舊活動先清掉再建，這支腳本才能重複執行。
     * missions 對 campaigns 是 ON DELETE 的關聯，任務會一起消失。
     */
    await client.query(
      `DELETE FROM missions WHERE campaign_id IN
         (SELECT id FROM campaigns WHERE name = $1)`,
      [CAMPAIGN],
    )
    await client.query('DELETE FROM campaigns WHERE name = $1', [CAMPAIGN])

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO campaigns (name, status, kind, starts_at, ends_at)
       VALUES ($1, 'active', 'community-day', now(), now() + ($2 || ' hours')::interval)
       RETURNING id`,
      [CAMPAIGN, String(DURATION_HOURS)],
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

    console.log(
      `\n建立「${CAMPAIGN}」，${located.length} 個任務點，` +
        `從現在起 ${DURATION_HOURS} 小時內有效。`,
    )
  })
}

try {
  await main()
} catch (error) {
  console.error('種子資料建立失敗：', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDb()
}
