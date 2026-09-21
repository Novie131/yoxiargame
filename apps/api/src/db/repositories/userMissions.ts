import type { PoolClient } from 'pg'

import { withTransaction } from '../client.ts'

/*
 * 玩家的任務進度。
 *
 * 這一層的重點只有一件事：**打卡的判定在伺服器做，不信任前端。**
 *
 * 前端已經算過「我在不在圍欄裡」（lib/missions 的 missionRelativeTo），
 * 那是為了決定按鈕要不要亮。但那個判定不能拿來當授權 ——
 * 任何人都可以直接打 API 說自己完成了。所以這裡拿使用者送來的座標
 * 重新跟 PostGIS 對一次。
 *
 * ── 誠實範圍：這不是防作弊 ──
 * 座標是前端給的，改得掉。伺服器驗證擋住的是「人在家裡按完成」這種
 * 最基本的情況，擋不住認真偽造 GPS 的人。真正的防作弊需要裝置簽章、
 * 移動軌跡合理性、或伺服器端的定位來源，那是另一個層級的工程。
 * 在那之前不要在任何地方把打卡紀錄講成「已驗證」。
 */

export type CheckInFailure =
  /** 任務不存在 */
  | 'not-found'
  /** 活動已結束，或任務不在時間範圍內 */
  | 'closed'
  /** 人不在圍欄裡 */
  | 'outside'

export type CheckInResult =
  | {
      ok: true
      missionId: string
      name: string
      /*
       * 這次之前就已經完成過了。
       *
       * 呼叫端要能分辨「剛完成」與「早就完成」—— 重送一次打卡不該再跳一次
       * 慶祝動畫，但也不該回報成錯誤（手機網路不穩時重送是常態）。
       */
      alreadyCompleted: boolean
      completedAt: string
      /** 打卡當下與任務中心的距離（公尺） */
      distanceMeters: number
    }
  | { ok: false; reason: CheckInFailure; name?: string; distanceMeters?: number }

/** 取得或建立外部使用者對應，回傳內部 uuid */
async function upsertUserRef(
  client: PoolClient,
  provider: string,
  externalRef: string,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO external_user_refs (provider, external_ref)
     VALUES ($1, $2)
     ON CONFLICT (provider, external_ref) DO UPDATE SET provider = EXCLUDED.provider
     RETURNING id`,
    [provider, externalRef],
  )
  return rows[0].id
}

/**
 * 打卡完成一個任務。
 *
 * 三個條件全部在同一個查詢裡判定，而且是用任務**自己的** radius_meters，
 * 不是一個全域的容許值 —— 一個公園級的任務與一個店門口的任務，
 * 合理的圍欄大小差很多，那個值本來就存在 missions 裡了。
 */
export async function checkInMission(
  externalUserRef: string,
  provider: string,
  missionId: string,
  lat: number,
  lon: number,
): Promise<CheckInResult> {
  return withTransaction(async (client) => {
    const point = `SRID=4326;POINT(${lon} ${lat})`

    const { rows } = await client.query<{
      name: string
      inside: boolean
      open: boolean
      distance_m: number
    }>(
      `SELECT m.name,
              ST_DWithin(m.location, $2::geography, m.radius_meters) AS inside,
              (c.status = 'active'
               AND (m.starts_at IS NULL OR m.starts_at <= now())
               AND (m.ends_at   IS NULL OR m.ends_at   >= now()))       AS open,
              ST_Distance(m.location, $2::geography)                    AS distance_m
         FROM missions m
         JOIN campaigns c ON c.id = m.campaign_id
        WHERE m.id = $1`,
      [missionId, point],
    )

    const mission = rows[0]
    if (!mission) return { ok: false, reason: 'not-found' }

    const distanceMeters = Math.round(Number(mission.distance_m))

    /*
     * 先判時間再判距離。
     *
     * 順序有差：人站在已經結束的活動地點上，該說的是「這個活動結束了」，
     * 不是「你不在範圍內」—— 後者會讓他在原地繞來繞去找不到問題。
     */
    if (!mission.open) {
      return { ok: false, reason: 'closed', name: mission.name, distanceMeters }
    }
    if (!mission.inside) {
      return { ok: false, reason: 'outside', name: mission.name, distanceMeters }
    }

    const userRefId = await upsertUserRef(client, provider, externalUserRef)

    /*
     * 冪等：同一個人對同一個任務只有一列。
     *
     * 已經是 completed 的話**不要覆寫** completed_at ——
     * 那是他第一次完成的時間，重送一次打卡不該把它往後推。
     * 用 xmax = 0 判斷這一列是新插入的還是更新的（Postgres 的慣用手法）。
     */
    const { rows: saved } = await client.query<{
      completed_at: Date
      inserted: boolean
    }>(
      `INSERT INTO user_missions
         (user_ref_id, mission_id, status, completed_lat, completed_lon, completed_at)
       VALUES ($1, $2, 'completed', $3, $4, now())
       ON CONFLICT (user_ref_id, mission_id) DO UPDATE SET
         status = 'completed',
         completed_lat = COALESCE(user_missions.completed_lat, EXCLUDED.completed_lat),
         completed_lon = COALESCE(user_missions.completed_lon, EXCLUDED.completed_lon),
         completed_at  = COALESCE(user_missions.completed_at,  EXCLUDED.completed_at),
         updated_at    = now()
       RETURNING completed_at, (xmax = 0) AS inserted`,
      [userRefId, missionId, lat, lon],
    )

    return {
      ok: true,
      missionId,
      name: mission.name,
      alreadyCompleted: !saved[0].inserted,
      completedAt: saved[0].completed_at.toISOString(),
      distanceMeters,
    }
  })
}

export type CompletedMission = {
  missionId: string
  name: string
  campaign: string
  lat: number
  lon: number
  tags: string[]
  completedAt: string
}

/**
 * 這個人完成過的任務，最近的排前面。
 *
 * 故意不做分頁：一個人完成的任務量級是幾十，不是幾千。
 * 真的長到需要分頁時再加，現在加只是多一組沒人用的參數。
 */
export async function listCompletedMissions(
  externalUserRef: string,
  provider: string,
  limit = 50,
): Promise<CompletedMission[]> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{
      mission_id: string
      name: string
      campaign: string
      lat: number
      lon: number
      tags: string[] | null
      completed_at: Date
    }>(
      `SELECT um.mission_id,
              m.name,
              c.name AS campaign,
              ST_Y(m.location::geometry) AS lat,
              ST_X(m.location::geometry) AS lon,
              m.tags,
              um.completed_at
         FROM user_missions um
         JOIN missions  m ON m.id = um.mission_id
         JOIN campaigns c ON c.id = m.campaign_id
         JOIN external_user_refs u ON u.id = um.user_ref_id
        WHERE u.provider = $1 AND u.external_ref = $2
          AND um.status = 'completed'
     ORDER BY um.completed_at DESC
        LIMIT $3`,
      [provider, externalUserRef, limit],
    )

    return rows.map((r) => ({
      missionId: r.mission_id,
      name: r.name,
      campaign: r.campaign,
      lat: Number(r.lat),
      lon: Number(r.lon),
      tags: r.tags ?? [],
      completedAt: r.completed_at.toISOString(),
    }))
  })
}
