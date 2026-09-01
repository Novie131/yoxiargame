import { withTransaction } from '../client.ts'

/*
 * 通勤路線的存取層。
 *
 * 注意 schema 的設計取向：`favorite_stations` 是「站點」為單位
 * （一列 = 一個要盯的站，含誤點門檻與通知開關），沒有「路線」這個實體。
 * 所以一條通勤路線在這裡會存成兩列（起點與終點）。
 * 若之後需要「路線」的概念（例如同一條路線的起訖要一起管理、一起刪除），
 * 需要新增 migration 建 routes 表。
 */

export type TransportMode = 'metro' | 'bus' | 'mixed'

export type SaveCommuteRouteInput = {
  externalUserRef: string
  provider?: string
  origin: string
  destination: string
  mode: TransportMode
  delayThresholdMinutes?: number
}

export type SavedCommuteRoute = {
  userRefId: string
  origin: string
  destination: string
  mode: TransportMode
  notificationEnabled: boolean
}

/** 取得或建立外部使用者對應，回傳內部 uuid */
async function upsertUserRef(
  client: import('pg').PoolClient,
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

export async function saveCommuteRoute(
  input: SaveCommuteRouteInput,
): Promise<SavedCommuteRoute> {
  const {
    externalUserRef,
    provider = 'prototype',
    origin,
    destination,
    mode,
    delayThresholdMinutes = 5,
  } = input

  return withTransaction(async (client) => {
    const userRefId = await upsertUserRef(client, provider, externalUserRef)

    // 路線的兩端各存一列。transport_mode 用 'mixed' 時兩端都記 mixed。
    for (const stationId of [origin, destination]) {
      await client.query(
        `INSERT INTO favorite_stations
           (user_ref_id, station_id, transport_mode, delay_threshold_minutes, notification_enabled)
         VALUES ($1, $2, $3, $4, true)`,
        [userRefId, stationId, mode, delayThresholdMinutes],
      )
    }

    return {
      userRefId,
      origin,
      destination,
      mode,
      notificationEnabled: true,
    }
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
