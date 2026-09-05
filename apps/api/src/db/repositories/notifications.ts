import type { PoolClient } from 'pg'

import { withTransaction } from '../client.ts'

/*
 * 通知與交通事件的存取層。
 *
 * 兩張表的分工：
 *   transit_disruptions  外部世界發生了什麼（一起事件一列，跟使用者數量無關）
 *   notifications        我們跟某個人說了什麼（一起事件 × 受影響的人）
 *
 * 輪詢每兩分鐘跑一次，同一起事件會被撈到幾十次，所以兩張表的寫入都必須是冪等的 ——
 * 靠的是 001 就設好的 (provider, external_event_id, observed_at) 唯一鍵，
 * 以及 003 加的 (user_ref_id, provider, external_event_id)。
 */

export type DisruptionInput = {
  provider: string
  externalEventId: string
  lineId: string | null
  stationId: string | null
  transportMode: 'metro' | 'bus'
  title: string
  description: string
  status: string
  /** TDX 的 UpdateTime。事件內容有更新才會產生新列，否則重複輪詢是冪等的。 */
  observedAt: string
  expiresAt: string
}

/** 回傳事件列的 id。同一個 (provider, event, observedAt) 重複寫入不會長新列。 */
export async function upsertDisruption(
  client: PoolClient,
  input: DisruptionInput,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO transit_disruptions
       (provider, external_event_id, line_id, station_id, transport_mode,
        delay_minutes, status, source_type, title, description, observed_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, NULL, $6, 'LIVE', $7, $8, $9, $10)
     ON CONFLICT (provider, external_event_id, observed_at) DO UPDATE SET
       line_id = EXCLUDED.line_id,
       station_id = EXCLUDED.station_id,
       status = EXCLUDED.status,
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       expires_at = EXCLUDED.expires_at
     RETURNING id`,
    [
      input.provider,
      input.externalEventId,
      input.lineId,
      input.stationId,
      input.transportMode,
      input.status,
      input.title,
      input.description,
      input.observedAt,
      input.expiresAt,
    ],
  )
  return rows[0].id
}

/*
 * delay_minutes 一律寫 NULL：TDX 的捷運資料沒有誤點分鐘數，只有事件通報。
 * source_type 一律 'LIVE'：這裡只寫真的從 TDX 撈到的東西，
 * FIXTURE / MOCK 留給測試資料，不要讓假資料混進同一條路徑。
 */

export type WatchedRoute = {
  userRefId: string
  origin: string
  destination: string
  line: string | null
  /** 空陣列代表每天都通勤 */
  usualDays: string[]
  /** 'HH:MM' 或 null（沒指定時段） */
  usualTimeStart: string | null
  usualTimeEnd: string | null
}

/**
 * 找出要盯這條路線的通勤設定。
 *
 * lineName 傳 null 代表這是沒有指定範圍的全網事件，所有已設定路線的人都受影響。
 * 時段判斷不在這裡做 —— 那需要台北時區的「現在」，放在 service 層比較好讀也好測。
 */
export async function findWatchedRoutes(
  client: PoolClient,
  lineName: string | null,
): Promise<WatchedRoute[]> {
  const { rows } = await client.query<{
    user_ref_id: string
    origin: string
    destination: string
    line: string | null
    usual_days: string[]
    usual_time_start: string | null
    usual_time_end: string | null
  }>(
    `SELECT r.user_ref_id, r.origin, r.destination, r.line,
            r.usual_days, r.usual_time_start, r.usual_time_end
       FROM commute_routes r
      WHERE r.notification_enabled
        /* 只找捷運 —— 公車路線名剛好等於捷運線名時會誤判成同一條線 */
        AND r.transport_mode IN ('metro', 'mixed')
        AND ($1::text IS NULL OR r.line = $1)`,
    [lineName],
  )

  return rows.map((r) => ({
    userRefId: r.user_ref_id,
    origin: r.origin,
    destination: r.destination,
    line: r.line,
    usualDays: r.usual_days ?? [],
    /* pg 的 time 型別回傳 'HH:MM:SS'，只留到分鐘就夠比對了 */
    usualTimeStart: r.usual_time_start?.slice(0, 5) ?? null,
    usualTimeEnd: r.usual_time_end?.slice(0, 5) ?? null,
  }))
}

/** 目前有使用者在盯公車的縣市。輪詢只需要撈這些縣市的事件。 */
export async function listWatchedBusCities(client: PoolClient): Promise<string[]> {
  const { rows } = await client.query<{ city: string }>(
    `SELECT DISTINCT city
       FROM commute_routes
      WHERE notification_enabled
        AND city IS NOT NULL
        AND transport_mode IN ('bus', 'mixed')`,
  )
  return rows.map((r) => r.city)
}

/**
 * 某個縣市裡要盯這條公車路線的通勤設定。
 *
 * routeName 傳 null 代表這是沒有指定路線的全市事件，該縣市所有公車使用者都受影響。
 */
export async function findWatchedBusRoutes(
  client: PoolClient,
  city: string,
  routeName: string | null,
): Promise<WatchedRoute[]> {
  const { rows } = await client.query<{
    user_ref_id: string
    origin: string
    destination: string
    line: string | null
    usual_days: string[]
    usual_time_start: string | null
    usual_time_end: string | null
  }>(
    `SELECT r.user_ref_id, r.origin, r.destination, r.line,
            r.usual_days, r.usual_time_start, r.usual_time_end
       FROM commute_routes r
      WHERE r.notification_enabled
        AND r.transport_mode IN ('bus', 'mixed')
        AND r.city = $1
        AND ($2::text IS NULL OR r.line = $2)`,
    [city, routeName],
  )

  return rows.map((r) => ({
    userRefId: r.user_ref_id,
    origin: r.origin,
    destination: r.destination,
    line: r.line,
    usualDays: r.usual_days ?? [],
    usualTimeStart: r.usual_time_start?.slice(0, 5) ?? null,
    usualTimeEnd: r.usual_time_end?.slice(0, 5) ?? null,
  }))
}

export type NotificationInput = {
  userRefId: string
  kind: string
  title: string
  body: string
  actionRoute: string | null
  actionLabel: string | null
  provider: string
  externalEventId: string
  /*
   * 對應的交通事件。地點推薦沒有事件可以指（它不是「發生了什麼」而是
   * 「你可能會有興趣」），所以允許 null。
   */
  disruptionId: string | null
}

/**
 * 寫入通知。同一個人 × 同一起事件只會有一列。
 *
 * 事件內容更新時是就地更新，而且**不會**把 read_at 清掉 ——
 * 使用者看過的東西不該因為 TDX 改了一個字就又跳回未讀。
 */
export async function upsertNotification(
  client: PoolClient,
  input: NotificationInput,
): Promise<'created' | 'updated'> {
  const { rows } = await client.query<{ created: boolean }>(
    /*
     * 003 的唯一索引是部分索引（只在 provider 與 event id 都不為 NULL 時生效），
     * ON CONFLICT 要帶同一組條件，Postgres 才推斷得出要用哪個索引。
     */
    `INSERT INTO notifications
       (user_ref_id, kind, title, body, action_route, action_label,
        provider, external_event_id, disruption_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_ref_id, provider, external_event_id)
       WHERE provider IS NOT NULL AND external_event_id IS NOT NULL
       DO UPDATE SET
         title = EXCLUDED.title,
         body = EXCLUDED.body,
         action_route = EXCLUDED.action_route,
         action_label = EXCLUDED.action_label,
         disruption_id = EXCLUDED.disruption_id,
         updated_at = now()
     RETURNING (xmax = 0) AS created`,
    [
      input.userRefId,
      input.kind,
      input.title,
      input.body,
      input.actionRoute,
      input.actionLabel,
      input.provider,
      input.externalEventId,
      input.disruptionId,
    ],
  )
  /* xmax = 0 是「這列是這次 INSERT 出來的」，用來分辨新增與更新 */
  return rows[0].created ? 'created' : 'updated'
}

export type Notification = {
  id: string
  kind: string
  title: string
  body: string
  actionRoute: string | null
  actionLabel: string | null
  createdAt: string
  read: boolean
}

/* 收件匣一次最多回這麼多。舊通知沒有回頭看的價值，不做分頁。 */
const LIST_LIMIT = 50

export async function listNotifications(
  externalUserRef: string,
  provider: string,
): Promise<{ notifications: Notification[]; unreadCount: number }> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{
      id: string
      kind: string
      title: string
      body: string
      action_route: string | null
      action_label: string | null
      created_at: Date
      read_at: Date | null
    }>(
      `SELECT n.id, n.kind, n.title, n.body, n.action_route, n.action_label,
              n.created_at, n.read_at
         FROM notifications n
         JOIN external_user_refs u ON u.id = n.user_ref_id
        WHERE u.provider = $1 AND u.external_ref = $2
     ORDER BY n.created_at DESC
        LIMIT $3`,
      [provider, externalUserRef, LIST_LIMIT],
    )

    const notifications = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      actionRoute: r.action_route,
      actionLabel: r.action_label,
      createdAt: r.created_at.toISOString(),
      read: r.read_at !== null,
    }))

    return {
      notifications,
      /* 未讀數只算這批 —— 超過上限的舊通知本來就看不到，算進去會對不上 */
      unreadCount: notifications.filter((n) => !n.read).length,
    }
  })
}

/** id 給了就只標那一則，沒給就全部標成已讀。回傳實際標記的則數。 */
export async function markRead(
  externalUserRef: string,
  provider: string,
  id?: string,
): Promise<number> {
  return withTransaction(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE notifications n
          SET read_at = now()
         FROM external_user_refs u
        WHERE u.id = n.user_ref_id
          AND u.provider = $1 AND u.external_ref = $2
          AND n.read_at IS NULL
          AND ($3::uuid IS NULL OR n.id = $3)`,
      [provider, externalUserRef, id ?? null],
    )
    return rowCount ?? 0
  })
}
