import type { PoolClient } from 'pg'

import { withTransaction } from '../client.ts'

/*
 * 通勤路線的存取層。
 *
 * 002 之前這裡沒有「路線」這個實體，一條路線被拆成兩列 favorite_stations，
 * 讀回來分不出哪列是起點，重複儲存還會一直長新列。
 * 現在路線本身存 commute_routes，favorite_stations 維持它原本的角色 ——
 * 通知服務要盯的站點清單 —— 並在儲存時同步。
 *
 * 008 之後一個使用者可以有兩條路線（上班、回家），用 label 區分。
 * 同一個 label 重設就是覆蓋，所以 upsert 的衝突鍵是 (user_ref_id, label)。
 * 回程不是去程的反向 —— 末班車分方向、班距分時段、路線也可能不同 ——
 * 所以它是獨立的一列，不能由去程推。
 */

export type TransportMode = 'metro' | 'bus' | 'mixed'

/*
 * 路線的用途。刻意只有兩個固定值，不讓使用者自己命名 ——
 * 自由命名會變成一個沒人填的欄位，理由見 008 migration 的註解。
 */
export type RouteLabel = 'commute' | 'home'

export const ROUTE_LABELS: RouteLabel[] = ['commute', 'home']

/** 沒指定時就是上班那條。002 時期存的資料也都是它。 */
export const DEFAULT_ROUTE_LABEL: RouteLabel = 'commute'

export function isRouteLabel(value: unknown): value is RouteLabel {
  return value === 'commute' || value === 'home'
}

export type CommuteRoute = {
  /** 這是上班那條還是回家那條 */
  label: RouteLabel
  origin: string
  destination: string
  mode: TransportMode
  /** 主要運具的路線名。推不出來時為 null，畫面就不顯示即時狀態。 */
  line: string | null
  /*
   * TDX 的城市代碼（Taipei、Taichung…）。只有公車需要 ——
   * 公車路線名要搭配城市才查得到，「307」在臺北與臺中是不同的線。
   */
  city: string | null
  /*
   * 通勤時段。通知要發得準就必須知道 —— 半夜推「板南線有異常」只會被關掉。
   *   usualDays 空陣列 = 每天都通勤（不是「都不通勤」）
   *   時間為 null    = 沒指定，交給 transit-watch 的靜音時段判斷
   *   start > end    = 跨午夜，例如大夜班的 22:00–02:00
   */
  usualDays: string[]
  usualTimeStart: string | null
  usualTimeEnd: string | null
  /*
   * 幾點要到目的地（HH:MM）。出發倒數的時間錨點。
   *
   * 跟 usualTimeStart/End 是不同的東西：那兩個講的是「什麼時段的異常要通知我」，
   * 這個講的是「我幾點要到」。混用的話，改通知時段會默默改掉出發倒數。
   * null = 沒設定，畫面退回「現在出發約 N 分鐘」，不要猜一個時間。
   */
  arriveBy: string | null
  delayThresholdMinutes: number
  notificationEnabled: boolean
}

export type SaveCommuteRouteInput = {
  externalUserRef: string
  provider?: string
  /** 沒給就是上班那條 */
  label?: RouteLabel
  origin: string
  destination: string
  mode: TransportMode
  line?: string | null
  city?: string | null
  usualDays?: string[]
  usualTimeStart?: string | null
  usualTimeEnd?: string | null
  arriveBy?: string | null
  delayThresholdMinutes?: number
  /*
   * 起訖站的座標。給「通勤路線附近有什麼活動」的空間查詢用。
   * 只有捷運站查得到，公車站牌沒有站表，所以可以是 null。
   */
  originLat?: number | null
  originLon?: number | null
  destinationLat?: number | null
  destinationLon?: number | null
}

type Row = {
  label: string
  origin: string
  destination: string
  transport_mode: string
  line: string | null
  city: string | null
  usual_days: string[] | null
  usual_time_start: string | null
  usual_time_end: string | null
  arrive_by: string | null
  delay_threshold_minutes: number
  notification_enabled: boolean
}

function toRoute(row: Row): CommuteRoute {
  return {
    /* 008 之前的列沒有 label，一律當成上班那條 */
    label: isRouteLabel(row.label) ? row.label : DEFAULT_ROUTE_LABEL,
    origin: row.origin,
    destination: row.destination,
    mode: row.transport_mode as TransportMode,
    line: row.line,
    city: row.city,
    usualDays: row.usual_days ?? [],
    /* pg 的 time 型別回傳 'HH:MM:SS'，對外一律只到分鐘 */
    usualTimeStart: row.usual_time_start?.slice(0, 5) ?? null,
    usualTimeEnd: row.usual_time_end?.slice(0, 5) ?? null,
    arriveBy: row.arrive_by?.slice(0, 5) ?? null,
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

/*
 * 把 favorite_stations 整份重算成「這個人所有路線的起訖站」。
 *
 * ── 為什麼要整份重算 ──
 * 008 之前只有一條路線，所以存路線時可以直接「刪掉不屬於這條路線的站」。
 * 有兩條之後那個寫法會把回家那條的站洗掉 —— 而且是默默地洗掉，
 * 使用者只會發現晚上不再收到通知，看不出跟早上改了路線有什麼關係。
 *
 * 所以改成：每次動到任何一條路線，就從 commute_routes 重新推導整張表。
 * 兩條路線加起來最多四站，重算的成本可以忽略，而它換來的是
 * 「favorite_stations 永遠等於 commute_routes 的投影」這個不用推理的性質。
 *
 * ── 通知開關怎麼合併 ──
 * 同一站同時屬於開著的路線與關掉的路線時，算開著（bool_or）。
 * 反過來的話，使用者關掉回家那條，就會連帶關掉上班那條的通知 ——
 * 那是他沒有要求的事，而漏掉通知比多一則糟。
 */
async function syncFavoriteStations(client: PoolClient, userRefId: string): Promise<void> {
  const { rows } = await client.query<{
    station_id: string
    transport_mode: string
    delay_threshold_minutes: number
    notification_enabled: boolean
  }>(
    `SELECT station_id,
            /* 同一站被兩條路線用到時，運具取任一條；兩條的運具不同是罕見情況 */
            min(transport_mode) AS transport_mode,
            min(delay_threshold_minutes) AS delay_threshold_minutes,
            bool_or(notification_enabled) AS notification_enabled
       FROM (
         SELECT origin AS station_id, transport_mode,
                delay_threshold_minutes, notification_enabled
           FROM commute_routes WHERE user_ref_id = $1
         UNION ALL
         SELECT destination AS station_id, transport_mode,
                delay_threshold_minutes, notification_enabled
           FROM commute_routes WHERE user_ref_id = $1
       ) s
      GROUP BY station_id`,
    [userRefId],
  )

  const stations = rows.map((r) => r.station_id)
  await client.query(
    'DELETE FROM favorite_stations WHERE user_ref_id = $1 AND station_id <> ALL($2::text[])',
    [userRefId, stations],
  )

  for (const row of rows) {
    /*
     * upsert 而不是先刪後插：notification_enabled 只在真的有路線關掉時才改寫，
     * 否則沿用既有值，才不會把使用者在站點層級調過的開關洗掉。
     */
    await client.query(
      `INSERT INTO favorite_stations
         (user_ref_id, station_id, transport_mode, delay_threshold_minutes, notification_enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_ref_id, station_id) DO UPDATE SET
         transport_mode = EXCLUDED.transport_mode,
         delay_threshold_minutes = EXCLUDED.delay_threshold_minutes,
         notification_enabled = EXCLUDED.notification_enabled,
         updated_at = now()`,
      [
        userRefId,
        row.station_id,
        row.transport_mode,
        row.delay_threshold_minutes,
        row.notification_enabled,
      ],
    )
  }
}

export async function saveCommuteRoute(
  input: SaveCommuteRouteInput,
): Promise<CommuteRoute> {
  const {
    externalUserRef,
    provider = 'prototype',
    label = DEFAULT_ROUTE_LABEL,
    origin,
    destination,
    mode,
    line = null,
    city = null,
    usualDays = [],
    usualTimeStart = null,
    usualTimeEnd = null,
    arriveBy = null,
    delayThresholdMinutes = 5,
    originLat = null,
    originLon = null,
    destinationLat = null,
    destinationLon = null,
  } = input

  return withTransaction(async (client) => {
    const userRefId = await upsertUserRef(client, provider, externalUserRef)

    const { rows } = await client.query<Row>(
      /* 衝突鍵是 (user_ref_id, label)：同一個 label 重設就是覆蓋，另一條不受影響 */
      `INSERT INTO commute_routes
         (user_ref_id, label, origin, destination, transport_mode, line, city,
          usual_days, usual_time_start, usual_time_end, arrive_by,
          delay_threshold_minutes,
          origin_lat, origin_lon, destination_lat, destination_lon)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (user_ref_id, label) DO UPDATE SET
         origin = EXCLUDED.origin,
         destination = EXCLUDED.destination,
         transport_mode = EXCLUDED.transport_mode,
         line = EXCLUDED.line,
         city = EXCLUDED.city,
         usual_days = EXCLUDED.usual_days,
         usual_time_start = EXCLUDED.usual_time_start,
         usual_time_end = EXCLUDED.usual_time_end,
         arrive_by = EXCLUDED.arrive_by,
         delay_threshold_minutes = EXCLUDED.delay_threshold_minutes,
         origin_lat = EXCLUDED.origin_lat,
         origin_lon = EXCLUDED.origin_lon,
         destination_lat = EXCLUDED.destination_lat,
         destination_lon = EXCLUDED.destination_lon,
         updated_at = now()
       RETURNING label, origin, destination, transport_mode, line, city,
                 usual_days, usual_time_start, usual_time_end, arrive_by,
                 delay_threshold_minutes, notification_enabled`,
      [
        userRefId,
        label,
        origin,
        destination,
        mode,
        line,
        city,
        usualDays,
        usualTimeStart,
        usualTimeEnd,
        arriveBy,
        delayThresholdMinutes,
        originLat,
        originLon,
        destinationLat,
        destinationLon,
      ],
    )

    /* 站點清單由所有路線一起決定，不是只看剛存的這一條 —— 見 syncFavoriteStations */
    await syncFavoriteStations(client, userRefId)

    return toRoute(rows[0])
  })
}

const SELECT_COLUMNS = `label, origin, destination, transport_mode, line, city,
       usual_days, usual_time_start, usual_time_end, arrive_by,
       delay_threshold_minutes, notification_enabled`

export async function getCommuteRoute(
  externalUserRef: string,
  provider = 'prototype',
  label: RouteLabel = DEFAULT_ROUTE_LABEL,
): Promise<CommuteRoute | null> {
  return withTransaction(async (client) => {
    const userRefId = await findUserRefId(client, provider, externalUserRef)
    if (!userRefId) return null

    const { rows } = await client.query<Row>(
      `SELECT ${SELECT_COLUMNS}
         FROM commute_routes
        WHERE user_ref_id = $1 AND label = $2`,
      [userRefId, label],
    )
    return rows[0] ? toRoute(rows[0]) : null
  })
}

/**
 * 這個人設定過的所有路線，上班那條排前面。
 *
 * 排序寫死在這裡而不是交給呼叫端：設定頁、行程頁、agent 的回覆都會列出路線，
 * 三個地方各排各的，使用者會看到三種順序。
 */
export async function listCommuteRoutes(
  externalUserRef: string,
  provider = 'prototype',
): Promise<CommuteRoute[]> {
  return withTransaction(async (client) => {
    const userRefId = await findUserRefId(client, provider, externalUserRef)
    if (!userRefId) return []

    const { rows } = await client.query<Row>(
      `SELECT ${SELECT_COLUMNS}
         FROM commute_routes
        WHERE user_ref_id = $1
     ORDER BY CASE label WHEN 'commute' THEN 0 ELSE 1 END, created_at`,
      [userRefId],
    )
    return rows.map(toRoute)
  })
}

/**
 * 開關通勤異常通知。
 *
 * transit-watch 的輪詢是用 `WHERE r.notification_enabled` 過濾的，
 * 所以關掉之後就真的不會再產生通知，不是只把畫面上的開關撥過去。
 *
 * favorite_stations 一併同步 —— 那張表是站點層級的通知設定，
 * 兩邊不一致的話，之後接站點通知時會拿到互相矛盾的狀態。
 *
 * 回傳 null 代表這個人根本還沒設定通勤路線，沒有東西可以開關。
 */
export async function setNotificationEnabled(
  externalUserRef: string,
  provider: string,
  enabled: boolean,
  label: RouteLabel = DEFAULT_ROUTE_LABEL,
): Promise<CommuteRoute | null> {
  return withTransaction(async (client) => {
    const userRefId = await findUserRefId(client, provider, externalUserRef)
    if (!userRefId) return null

    const { rows } = await client.query<Row>(
      `UPDATE commute_routes
          SET notification_enabled = $3, updated_at = now()
        WHERE user_ref_id = $1 AND label = $2
      RETURNING label, origin, destination, transport_mode, line, city,
                 usual_days, usual_time_start, usual_time_end, arrive_by,
                 delay_threshold_minutes, notification_enabled`,
      [userRefId, label, enabled],
    )
    if (!rows[0]) return null

    /*
     * 站點的開關由所有路線一起決定，不能直接整批寫成 enabled ——
     * 關掉回家那條時，上班那條還開著的站必須維持開著。
     */
    await syncFavoriteStations(client, userRefId)

    return toRoute(rows[0])
  })
}

/** 回傳是否真的刪到東西，讓呼叫端能分辨 404 與 204 */
export async function deleteCommuteRoute(
  externalUserRef: string,
  provider = 'prototype',
  label: RouteLabel = DEFAULT_ROUTE_LABEL,
): Promise<boolean> {
  return withTransaction(async (client) => {
    const userRefId = await findUserRefId(client, provider, externalUserRef)
    if (!userRefId) return false

    const { rowCount } = await client.query(
      'DELETE FROM commute_routes WHERE user_ref_id = $1 AND label = $2',
      [userRefId, label],
    )
    /*
     * 只刪這一條的站，另一條的要留著。整批刪掉的舊寫法在兩條路線之下
     * 會讓刪除回家那條連帶關掉早上的通知。
     */
    await syncFavoriteStations(client, userRefId)
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
