import { withTransaction } from '../client.ts'

/*
 * 社群日的存取層。
 *
 * 社群日 = kind 為 'community-day' 的 campaign，它帶著一批任務點，
 * 而且只在一段時間內有效（見 011 migration）。
 */

export type CommunityDayMission = {
  id: string
  name: string
  lat: number
  lon: number
  radiusMeters: number
  tags: string[]
  /** 這個人完成了沒。沒帶使用者查詢時一律 false。 */
  completed: boolean
}

export type CommunityDay = {
  campaignId: string
  name: string
  startsAt: string | null
  endsAt: string | null
  missions: CommunityDayMission[]
  /*
   * 今天有多少人完成過這場活動的任務。
   *
   * 這是**聚合數字，不是媒合**。我們沒有登入（X-User-Ref 是裝置識別），
   * 也沒有即時位置，做不了真正的共乘配對。它能誠實回答的只有
   * 「這場活動今天熱不熱」—— 呼叫端不要把它講成「附近有 N 個人可以共乘」。
   */
  participantsToday: number
}

/*
 * 找出「現在、這附近」進行中的社群日。
 *
 * 兩個條件都必要：
 *   時間  活動正在進行（明天的活動今天推，使用者跑去了會撲空）
 *   距離  至少有一個任務點在使用者附近（台中的社群日不該推給台北的人）
 */
export async function findActiveCommunityDay(
  lat: number,
  lon: number,
  radiusMeters: number,
  user?: { provider: string; externalRef: string },
): Promise<CommunityDay | null> {
  return withTransaction(async (client) => {
    const point = `SRID=4326;POINT(${lon} ${lat})`

    /*
     * 先找活動本身。
     *
     * 同時有多場進行中時取「最近的那一場」—— 不是最早開始的。
     * 使用者要的是他走得到的那一場，不是行事曆上排最前面的。
     */
    const { rows: campaigns } = await client.query<{
      id: string
      name: string
      starts_at: Date | null
      ends_at: Date | null
    }>(
      `SELECT c.id, c.name, c.starts_at, c.ends_at
         FROM campaigns c
         JOIN missions m ON m.campaign_id = c.id
        WHERE c.kind = 'community-day'
          AND c.status = 'active'
          AND (c.starts_at IS NULL OR c.starts_at <= now())
          AND (c.ends_at   IS NULL OR c.ends_at   >= now())
          AND ST_DWithin(m.location, $1::geography, $2)
     GROUP BY c.id, c.name, c.starts_at, c.ends_at
     ORDER BY min(ST_Distance(m.location, $1::geography))
        LIMIT 1`,
      [point, radiusMeters],
    )

    const campaign = campaigns[0]
    if (!campaign) return null

    /*
     * 這場活動的**全部**任務點，不只附近那些 ——
     * 行程規劃要看到整場活動才排得出順序。範圍判定已經在上面做過了。
     */
    const { rows: missions } = await client.query<{
      id: string
      name: string
      lat: number
      lon: number
      radius_meters: number
      tags: string[] | null
      completed: boolean
    }>(
      `SELECT m.id,
              m.name,
              ST_Y(m.location::geometry) AS lat,
              ST_X(m.location::geometry) AS lon,
              m.radius_meters,
              m.tags,
              (um.status = 'completed') IS TRUE AS completed
         FROM missions m
         LEFT JOIN external_user_refs u
                ON u.provider = $2 AND u.external_ref = $3
         LEFT JOIN user_missions um
                ON um.mission_id = m.id AND um.user_ref_id = u.id
        WHERE m.campaign_id = $1
          AND (m.starts_at IS NULL OR m.starts_at <= now())
          AND (m.ends_at   IS NULL OR m.ends_at   >= now())`,
      [campaign.id, user?.provider ?? null, user?.externalRef ?? null],
    )

    /* 今天有多少人完成過這場活動的任務（去重到人） */
    const { rows: counted } = await client.query<{ n: string }>(
      `SELECT count(DISTINCT um.user_ref_id) AS n
         FROM user_missions um
         JOIN missions m ON m.id = um.mission_id
        WHERE m.campaign_id = $1
          AND um.status = 'completed'
          /*
           * 臺北時間的今天從幾點開始。
           *
           * 兩個 AT TIME ZONE 缺一不可：
           *   第一個 把 now() 轉成臺北的牆上時間（timestamptz → timestamp）
           *   第二個 把截斷後的午夜「當成臺北時間」轉回 timestamptz
           *
           * 少了第二個，date_trunc 的結果會是一個沒有時區的 timestamp，
           * 拿去跟 timestamptz 比較時 Postgres 會用**伺服器時區**解讀它
           * （這裡是 UTC），於是邊界整整晚了 8 小時 —— 結果永遠是 0。
           */
          AND um.completed_at >=
              (date_trunc('day', now() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei')`,
      [campaign.id],
    )

    return {
      campaignId: campaign.id,
      name: campaign.name,
      startsAt: campaign.starts_at?.toISOString() ?? null,
      endsAt: campaign.ends_at?.toISOString() ?? null,
      missions: missions.map((m) => ({
        id: m.id,
        name: m.name,
        lat: Number(m.lat),
        lon: Number(m.lon),
        radiusMeters: m.radius_meters,
        tags: m.tags ?? [],
        completed: m.completed,
      })),
      participantsToday: Number(counted[0]?.n ?? 0),
    }
  })
}
