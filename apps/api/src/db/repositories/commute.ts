import type { PoolClient } from 'pg'

import { withTransaction } from '../client.ts'

/*
 * 通勤路線的存取層。
 *
 * 002 之前這裡沒有「路線」這個實體，一條路線被拆成兩列 favorite_stations，
 * 讀回來分不出哪列是起點，重複儲存還會一直長新列。
 * 現在路線本身存 commute_routes（一個使用者一條，重設就是覆蓋），
 * favorite_stations 維持它原本的角色 —— 通知服務要盯的站點清單 —— 並在儲存時同步。
 */

export type TransportMode = 'metro' | 'bus' | 'mixed'

export type CommuteRoute = {
  origin: string
  destination: string
  mode: TransportMode
  /** 主要運具的路線名。推不出來時為 null，畫面就不顯示即時狀態。 */
  line: string | null
  /*
   * 通勤時段。通知要發得準就必須知道 —— 半夜推「板南線有異常」只會被關掉。
   *   usualDays 空陣列 = 每天都通勤（不是「都不通勤」）
   *   時間為 null    = 沒指定，交給 transit-watch 的靜音時段判斷
   *   start > end    = 跨午夜，例如大夜班的 22:00–02:00
   */
  usualDays: string[]
  usualTimeStart: string | null
  usualTimeEnd: string | null
  delayThresholdMinutes: number
  notificationEnabled: boolean
}

export type SaveCommuteRouteInput = {
  externalUserRef: string
  provider?: string
  origin: string
  destination: string
  mode: TransportMode
  line?: string | null
  usualDays?: string[]
  usualTimeStart?: string | null
  usualTimeEnd?: string | null
  delayThresholdMinutes?: number
}

type Row = {
  origin: string
  destination: string
  transport_mode: string
  line: string | null
  usual_days: string[] | null
  usual_time_start: string | null
  usual_time_end: string | null
  delay_threshold_minutes: number
  notification_enabled: boolean
}

function toRoute(row: Row): CommuteRoute {
  return {
    origin: row.origin,
    destination: row.destination,
    mode: row.transport_mode as TransportMode,
    line: row.line,
    usualDays: row.usual_days ?? [],
    /* pg 的 time 型別回傳 'HH:MM:SS'，對外一律只到分鐘 */
    usualTimeStart: row.usual_time_start?.slice(0, 5) ?? null,
    usualTimeEnd: row.usual_time_end?.slice(0, 5) ?? null,
    delayThresholdMinutes: row.delay_threshold_minutes,
    notificationEnabled: row.notification_enabled,
  }
}

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

/** 已存在時才查 id，不建立 —— 讀取路徑不該因為有人查詢就長出使用者列 */
async function findUserRefId(
  client: PoolClient,
  provider: string,
  externalRef: string,
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    'SELECT id FROM external_user_refs WHERE provider = $1 AND external_ref = $2',
    [provider, externalRef],
  )
  return rows[0]?.id ?? null
}

export async function saveCommuteRoute(
  input: SaveCommuteRouteInput,
): Promise<CommuteRoute> {
  const {
    externalUserRef,
    provider = 'prototype',
    origin,
    destination,
    mode,
    line = null,
    usualDays = [],
    usualTimeStart = null,
    usualTimeEnd = null,
    delayThresholdMinutes = 5,
  } = input

  return withTransaction(async (client) => {
    const userRefId = await upsertUserRef(client, provider, externalUserRef)

    const { rows } = await client.query<Row>(
      `INSERT INTO commute_routes
         (user_ref_id, origin, destination, transport_mode, line,
          usual_days, usual_time_start, usual_time_end, delay_threshold_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_ref_id) DO UPDATE SET
         origin = EXCLUDED.origin,
         destination = EXCLUDED.destination,
         transport_mode = EXCLUDED.transport_mode,
         line = EXCLUDED.line,
         usual_days = EXCLUDED.usual_days,
         usual_time_start = EXCLUDED.usual_time_start,
         usual_time_end = EXCLUDED.usual_time_end,
         delay_threshold_minutes = EXCLUDED.delay_threshold_minutes,
         updated_at = now()
       RETURNING origin, destination, transport_mode, line,
                 usual_days, usual_time_start, usual_time_end,
                 delay_threshold_minutes, notification_enabled`,
      [
        userRefId,
        origin,
        destination,
        mode,
        line,
        usualDays,
        usualTimeStart,
        usualTimeEnd,
        delayThresholdMinutes,
      ],
    )

    /*
     * 同步通知用的站點清單：先移除不再屬於這條路線的站，再寫入起訖兩站。
     * 用 upsert 而不是先刪後插，才不會把使用者調過的通知開關洗掉。
     */
    const stations = [...new Set([origin, destination])]
    await client.query(
      'DELETE FROM favorite_stations WHERE user_ref_id = $1 AND station_id <> ALL($2::text[])',
      [userRefId, stations],
    )
    for (const stationId of stations) {
      await client.query(
        `INSERT INTO favorite_stations
           (user_ref_id, station_id, transport_mode, delay_threshold_minutes, notification_enabled)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (user_ref_id, station_id) DO UPDATE SET
           transport_mode = EXCLUDED.transport_mode,
           delay_threshold_minutes = EXCLUDED.delay_threshold_minutes,
           updated_at = now()`,
        [userRefId, stationId, mode, delayThresholdMinutes],
      )
    }

    return toRoute(rows[0])
  })
}

export async function getCommuteRoute(
  externalUserRef: string,
  provider = 'prototype',
): Promise<CommuteRoute | null> {
  return withTransaction(async (client) => {
    const userRefId = await findUserRefId(client, provider, externalUserRef)
    if (!userRefId) return null

    const { rows } = await client.query<Row>(
      `SELECT origin, destination, transport_mode, line,
              usual_days, usual_time_start, usual_time_end,
              delay_threshold_minutes, notification_enabled
         FROM commute_routes
        WHERE user_ref_id = $1`,
      [userRefId],
    )
    return rows[0] ? toRoute(rows[0]) : null
  })
}

/** 回傳是否真的刪到東西，讓呼叫端能分辨 404 與 204 */
export async function deleteCommuteRoute(
  externalUserRef: string,
  provider = 'prototype',
): Promise<boolean> {
  return withTransaction(async (client) => {
    const userRefId = await findUserRefId(client, provider, externalUserRef)
    if (!userRefId) return false

    const { rowCount } = await client.query(
      'DELETE FROM commute_routes WHERE user_ref_id = $1',
      [userRefId],
    )
    await client.query('DELETE FROM favorite_stations WHERE user_ref_id = $1', [userRefId])
    return (rowCount ?? 0) > 0
  })
}

export async function listFavoriteStations(
  externalUserRef: string,
  provider = 'prototype',
): Promise<Array<{ stationId: string; transportMode: string; notificationEnabled: boolean }>> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{
      station_id: string
      transport_mode: string
      notification_enabled: boolean
    }>(
      `SELECT fs.station_id, fs.transport_mode, fs.notification_enabled
         FROM favorite_stations fs
         JOIN external_user_refs u ON u.id = fs.user_ref_id
        WHERE u.provider = $1 AND u.external_ref = $2
     ORDER BY fs.created_at`,
      [provider, externalUserRef],
    )
    return rows.map((r) => ({
      stationId: r.station_id,
      transportMode: r.transport_mode,
      notificationEnabled: r.notification_enabled,
    }))
  })
}
