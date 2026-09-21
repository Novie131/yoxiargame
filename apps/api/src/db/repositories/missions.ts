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
  /*
   * 這個人在這個任務上的進度。沒帶使用者查詢、或他還沒碰過這個任務時是 null。
   *
   * 跟在同一個查詢裡回來（LEFT JOIN），不另外開一支 API ——
   * 分兩次拿的話，地圖上會先畫出一批全部「未完成」的圖釘，
   * 第二個請求回來才變色，而那個閃爍看起來像壞掉。
   */
  status: 'seen' | 'started' | 'completed' | null
  completedAt: string | null
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
  /*
   * 要一起帶回進度時給。沒給就全部是 null ——
   * 探索地圖在沒有識別的情況下仍然要看得到任務，進度只是加分項。
   */
  user?: { provider: string; externalRef: string },
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
      status: string | null
      completed_at: Date | null
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
              um.status,
              um.completed_at,
              m.starts_at,
              m.ends_at
         FROM missions m
         JOIN campaigns c ON c.id = m.campaign_id
         /*
          * 進度是 LEFT JOIN：沒做過的任務照樣要出現在地圖上。
          * 用 INNER JOIN 的話地圖會只剩下他已經碰過的那幾個。
          * 沒帶使用者時 $5/$6 是 NULL，整個 join 條件不成立，status 全是 null。
          */
         LEFT JOIN external_user_refs u
                ON u.provider = $5 AND u.external_ref = $6
         LEFT JOIN user_missions um
                ON um.mission_id = m.id AND um.user_ref_id = u.id
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
        user?.provider ?? null,
        user?.externalRef ?? null,
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
      /* CHECK 約束保證只會是這三個值，但資料是從資料庫來的，還是收斂一次 */
      status:
        r.status === 'seen' || r.status === 'started' || r.status === 'completed'
          ? r.status
          : null,
      completedAt: r.completed_at?.toISOString() ?? null,
      startsAt: r.starts_at?.toISOString() ?? null,
      endsAt: r.ends_at?.toISOString() ?? null,
    }))
  })
}
