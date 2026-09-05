import { closeDb, hasDatabase, withTransaction } from '../src/db/client.ts'
import { geocodeDistrict } from '../src/services/weather.ts'

/*
 * 探索任務的種子資料。
 *
 * 用途：讓探索地圖與 search_activities 有東西可查。missions / campaigns 兩張表
 * 從 001 就建好了（含 PostGIS 空間索引），但一直是空的。
 *
 * 這是**開發用的示範資料**，刻意做成獨立腳本而不是 migration ——
 * migration 是 schema，不該塞內容，而且這支要打外部地理編碼服務，
 * 不可能在部署流程裡當成確定性的步驟跑。正式的活動資料應該由後台建立。
 *
 * 座標一律用 OpenStreetMap 的地理編碼查出來，不是手寫的 ——
 * 手寫座標會有幾百公尺的誤差，而地理圍欄的半徑只有兩百公尺，那會直接失準。
 * 查不到的地點就跳過並回報，不要塞一個猜的座標進資料庫。
 *
 * 執行：npm --prefix apps/api run seed:missions
 */

/* 觸發半徑。公園、廣場這種尺度的地標，200 公尺大約是「走到了」的距離。 */
const RADIUS_METERS = 200

/*
 * 「yoxi 尋寶」是自營活動，刻意跟城市探索分開成獨立的 campaign。
 *
 * 理由是風險分散：ROADMAP 把 Pokémon GO / Pikmin 的 IP 授權列為
 * 「可能影響整個產品方向」。探索功能如果只靠第三方 IP 撐，萬一談不成就整個空掉。
 * 有一條自營的主軸，IP 就變成加分項而不是命脈。
 */
/*
 * 標籤用探索頁 chips 的 id，兩邊必須一致（見 apps/mobile 的 ExploreScreen）。
 *
 * 刻意**沒有**任何地點掛上 pokemon-go / pikmin：我們跟那兩款遊戲沒有實際整合，
 * 硬掛上去就是在資料庫裡編造一段不存在的關係。使用者選了那兩個標籤時，
 * 畫面會照實說目前沒有相關任務 —— 那也正好說明了為什麼需要自營主軸。
 */
type SeedPlace = { name: string; tags: string[] }

const SEED: Array<{ campaign: string; places: SeedPlace[] }> = [
  {
    campaign: 'yoxi 尋寶',
    places: [
      { name: '臺北市立美術館', tags: ['photo', 'travel', 'reading'] },
      { name: '四四南村', tags: ['coffee', 'photo', 'food'] },
      { name: '新北市立圖書館總館', tags: ['reading', 'tech'] },
      { name: '台中州廳', tags: ['travel', 'photo'] },
    ],
  },
  {
    campaign: '城市探索・台北',
    places: [
      { name: '大安森林公園', tags: ['sport', 'photo', 'travel'] },
      { name: '中正紀念堂', tags: ['travel', 'photo'] },
      { name: '華山1914文化創意產業園區', tags: ['photo', 'coffee', 'movie'] },
      { name: '大稻埕碼頭', tags: ['travel', 'photo', 'food'] },
      { name: '象山', tags: ['sport', 'photo'] },
    ],
  },
  {
    campaign: '城市探索・新北',
    places: [
      { name: '林本源園邸', tags: ['travel', 'photo'] },
      { name: '淡水老街', tags: ['food', 'travel'] },
      { name: '十三行博物館', tags: ['travel', 'reading'] },
      { name: '新北市市民廣場', tags: ['sport', 'music'] },
    ],
  },
  {
    campaign: '城市探索・台中',
    places: [
      { name: '台中公園', tags: ['sport', 'travel'] },
      { name: '審計新村', tags: ['coffee', 'photo', 'food'] },
      { name: '秋紅谷', tags: ['sport', 'photo'] },
      { name: '國立臺灣美術館', tags: ['travel', 'photo', 'reading'] },
    ],
  },
]

/* Nominatim 的使用條款要求每秒最多一次請求 */
const GEOCODE_DELAY_MS = 1100
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  if (!hasDatabase()) {
    console.error('缺少 DATABASE_URL，無法寫入種子資料')
    process.exitCode = 1
    return
  }

  let created = 0
  let skipped = 0
  let failed = 0

  for (const group of SEED) {
    /* 先把地點查完再寫入 —— 地理編碼比較慢，不要讓交易開著等外部服務 */
    const located: Array<{ name: string; tags: string[]; lat: number; lon: number }> = []

    for (const place of group.places) {
      try {
        const hit = await geocodeDistrict(place.name)
        if (hit) {
          located.push({ name: place.name, tags: place.tags, lat: hit.lat, lon: hit.lon })
        } else {
          console.warn(`  查不到座標，略過：${place.name}`)
          failed += 1
        }
      } catch (error) {
        console.warn(`  地理編碼失敗，略過：${place.name}`, error)
        failed += 1
      }
      await sleep(GEOCODE_DELAY_MS)
    }

    await withTransaction(async (client) => {
      /* 依名稱找或建活動，重跑腳本不會長出重複的活動 */
      const found = await client.query<{ id: string }>(
        'SELECT id FROM campaigns WHERE name = $1',
        [group.campaign],
      )
      const campaignId =
        found.rows[0]?.id ??
        (
          await client.query<{ id: string }>(
            `INSERT INTO campaigns (name, status) VALUES ($1, 'active') RETURNING id`,
            [group.campaign],
          )
        ).rows[0].id

      for (const p of located) {
        /*
         * 已存在就只更新標籤 —— 重跑腳本是為了補標籤，不該因為座標已經在
         * 就什麼都不做，那樣舊資料永遠拿不到新加的欄位。
         */
        const updated = await client.query(
          'UPDATE missions SET tags = $3 WHERE campaign_id = $1 AND name = $2',
          [campaignId, p.name, p.tags],
        )
        if ((updated.rowCount ?? 0) > 0) {
          skipped += 1
          continue
        }

        await client.query(
          `INSERT INTO missions (campaign_id, name, location, radius_meters, tags)
           VALUES ($1, $2, ST_GeogFromText($3), $4, $5)`,
          [campaignId, p.name, `SRID=4326;POINT(${p.lon} ${p.lat})`, RADIUS_METERS, p.tags],
        )
        created += 1
        console.log(`  ✓ ${p.name} (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})`)
      }
    })
  }

  console.log(`\n新增 ${created} 個任務、更新 ${skipped} 個既有任務的標籤、${failed} 個查不到座標`)
  await closeDb()
}

await main()
