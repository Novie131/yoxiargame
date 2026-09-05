import { withTransaction } from '../client.ts'

/*
 * 任務（地理圍欄）的存取層。
 *
 * missions 與 campaigns 從 001 就建好了，含 geography(Point,4326) 與 GiST 空間索引，
 * 但在這之前全專案沒有任何一行程式碼用到它們 —— 整套地理圍欄基礎設施是空的。
 *
 * 查詢一律走 ST_DWithin(geography, geography, 公尺)，那個形式才吃得到
 * missions_location_gix 這個 GiST 索引；用 ST_Distance(...) < r 會變成全表掃描。
 */

export type NearbyMission = {
  id: string
  name: string
  campaign: string
  lat: number
  lon: number
  /** 這個任務自己的觸發半徑（公尺） */
  radiusMeters: number
  /** 興趣標籤，值與探索頁的 chips id 一致 */
  tags: string[]
  /** 使用者與任務中心的距離（公尺，四捨五入） */
  distanceMeters: number
  /** 使用者是不是已經站在圍欄裡 —— 這就是「動態地理圍欄」的判定 */
  inside: boolean
  startsAt: string | null
  endsAt: string | null
}

/* 一次最多回幾筆。探索頁一次也顯示不了那麼多，而且要控制回應大小。 */
const MAX_RESULTS = 50

/**
 * 找出座標附近、目前有效的任務。
 *
 * 「有效」= 活動還在進行中（campaigns.status = 'active'）而且任務本身在時間範圍內。
 * 過期的任務不該出現在地圖上 —— 那會讓使用者白跑一趟。
 */
export async function findNearbyMissions(
  lat: number,
  lon: number,
  radiusMeters: number,
  limit = 20,
  /*
   * 有給就只回符合任一標籤的任務（陣列交集，吃 GIN 索引）。
   *
   * 地圖不會用這個參數 —— 那邊要的是「全部拿回來、不符合的變淡」，
   * 直接篩掉會讓地圖突然清空，看起來像壞了。這個參數是給 agent 用的，
   * 對話裡問「附近有什麼咖啡廳」時才需要真的過濾。
   */
  tags?: string[],
): Promise<NearbyMission[]> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{
      id: string
      name: string
      campaign: string
      lat: number
      lon: number
      radius_meters: number
      tags: string[] | null
      distance_m: number
      inside: boolean
      starts_at: Date | null
      ends_at: Date | null
    }>(
      `SELECT m.id,
              m.name,
              c.name AS campaign,
              ST_Y(m.location::geometry) AS lat,
              ST_X(m.location::geometry) AS lon,
              m.radius_meters,
              m.tags,
              ST_Distance(m.location, $1::geography) AS distance_m,
              ST_DWithin(m.location, $1::geography, m.radius_meters) AS inside,
              m.starts_at,
              m.ends_at
         FROM missions m
         JOIN campaigns c ON c.id = m.campaign_id
        WHERE ST_DWithin(m.location, $1::geography, $2)
          AND c.status = 'active'
          AND (m.starts_at IS NULL OR m.starts_at <= now())
          AND (m.ends_at IS NULL OR m.ends_at >= now())
          AND ($4::text[] IS NULL OR m.tags && $4::text[])
     ORDER BY distance_m
        LIMIT $3`,
      [
        `SRID=4326;POINT(${lon} ${lat})`,
        radiusMeters,
        Math.min(limit, MAX_RESULTS),
        tags?.length ? tags : null,
      ],
    )

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      campaign: r.campaign,
      lat: Number(r.lat),
      lon: Number(r.lon),
      radiusMeters: r.radius_meters,
      tags: r.tags ?? [],
      distanceMeters: Math.round(Number(r.distance_m)),
      inside: r.inside,
      startsAt: r.starts_at?.toISOString() ?? null,
      endsAt: r.ends_at?.toISOString() ?? null,
    }))
  })
}
