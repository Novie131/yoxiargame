import { hasDatabase, withTransaction } from '../db/client.ts'
import { upsertNotification } from '../db/repositories/notifications.ts'

/*
 * 反向導流：讓活動主動找上使用者。
 *
 * 到目前為止所有的探索都是「使用者打開 App → 滑地圖 → 看到任務」。
 * 這支反過來：冷門地點在對的時間主動出現在使用者的通知裡。
 * 這就是「動態需求形塑」實際的樣子。
 *
 * 但主動通知很容易變成廣告，所以規則刻意收得很緊，三個條件全部要成立：
 *
 *   1. 任務就在他每天會經過的地方（通勤起訖站附近）
 *   2. 任務的標籤符合他自己選的興趣（沒選興趣就不推 —— 沒有依據就不要吵他）
 *   3. 現在是他的通勤時段，而且不在靜音時段
 *
 * 少了任何一條就不發。寧可少推，也不要讓使用者學會把通知關掉。
 *
 * 效能上這是**一句 SQL**：通勤路線的起訖座標存在 commute_routes 裡，
 * 任務有 PostGIS 空間索引，興趣有 GIN 索引，全部在資料庫裡做完，
 * 不會因為使用者變多就多打外部服務。
 */

/* 通勤站多遠以內算「會經過」。步行十分鐘以內，順路去得了才有意義。 */
const NEAR_COMMUTE_METERS = 800

/* 一輪最多推薦幾則。地點推薦不是急事，慢慢滲透比一次灌爆好。 */
const MAX_PER_ROUND = 20

const PROVIDER = 'discovery'

/* 一個人對同一個任務只推一次 —— 去重鍵，跟交通事件的命名空間分開 */
const missionEventId = (missionId: string) => `mission:${missionId}`

export type DiscoveryResult = {
  ok: boolean
  reason?: string
  candidates: number
  created: number
  skipped: number
}

const EMPTY = { candidates: 0, created: 0, skipped: 0 }

type Row = {
  user_ref_id: string
  mission_id: string
  mission_name: string
  campaign: string
  lat: number
  lon: number
  distance_m: number
  usual_days: string[] | null
  usual_time_start: string | null
  usual_time_end: string | null
}

const TIMEZONE = 'Asia/Taipei'
const QUIET_START = '23:00'
const QUIET_END = '06:00'

function taipeiNow(at: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { day: get('weekday').toLowerCase(), time: `${get('hour')}:${get('minute')}` }
}

function withinWindow(time: string, start: string, end: string): boolean {
  return start <= end ? time >= start && time <= end : time >= start || time <= end
}

/*
 * 該不該現在打擾這個人。
 *
 * 跟交通異常用同一套時段判斷，但門檻更嚴：交通異常是「現在就影響到你」，
 * 地點推薦只是「你可能會有興趣」，所以沒設通勤時段的人只推白天，
 * 不套用「除了深夜都可以」那個較寬鬆的預設。
 */
const DISCOVERY_START = '09:00'
const DISCOVERY_END = '21:00'

function shouldRecommend(row: Row, now: { day: string; time: string }): boolean {
  const days = row.usual_days ?? []
  if (days.length > 0 && !days.includes(now.day)) return false

  const start = row.usual_time_start?.slice(0, 5)
  const end = row.usual_time_end?.slice(0, 5)
  if (start && end) {
    /* 使用者自己設的時段優先，但仍然不在深夜推薦 */
    return withinWindow(now.time, start, end) && !withinWindow(now.time, QUIET_START, QUIET_END)
  }

  return withinWindow(now.time, DISCOVERY_START, DISCOVERY_END)
}

function distanceText(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} 公里` : `${Math.round(meters)} 公尺`
}

export async function recommendMissions(at: Date = new Date()): Promise<DiscoveryResult> {
  if (!hasDatabase()) return { ok: false, reason: '未設定 DATABASE_URL', ...EMPTY }

  const now = taipeiNow(at)
  const result: DiscoveryResult = { ok: true, ...EMPTY }

  try {
    await withTransaction(async (client) => {
      const { rows } = await client.query<Row>(
        `SELECT r.user_ref_id,
                m.id   AS mission_id,
                m.name AS mission_name,
                c.name AS campaign,
                ST_Y(m.location::geometry) AS lat,
                ST_X(m.location::geometry) AS lon,
                LEAST(
                  COALESCE(ST_Distance(m.location,
                    ST_SetSRID(ST_MakePoint(r.origin_lon, r.origin_lat), 4326)::geography), 1e9),
                  COALESCE(ST_Distance(m.location,
                    ST_SetSRID(ST_MakePoint(r.destination_lon, r.destination_lat), 4326)::geography), 1e9)
                ) AS distance_m,
                r.usual_days, r.usual_time_start, r.usual_time_end
           FROM commute_routes r
           JOIN user_preferences p ON p.user_ref_id = r.user_ref_id
           JOIN missions m
             ON (
                  (r.origin_lat IS NOT NULL AND ST_DWithin(m.location,
                     ST_SetSRID(ST_MakePoint(r.origin_lon, r.origin_lat), 4326)::geography, $1))
               OR (r.destination_lat IS NOT NULL AND ST_DWithin(m.location,
                     ST_SetSRID(ST_MakePoint(r.destination_lon, r.destination_lat), 4326)::geography, $1))
                )
           JOIN campaigns c ON c.id = m.campaign_id
          WHERE r.notification_enabled
            AND p.discovery_enabled
            /* 沒選興趣就不推 —— 沒有依據的推薦就是廣告 */
            AND array_length(p.interests, 1) > 0
            AND m.tags && p.interests
            AND c.status = 'active'
            AND (m.starts_at IS NULL OR m.starts_at <= now())
            AND (m.ends_at IS NULL OR m.ends_at >= now())
            /* 已經推過的就不要再推，去重在 SQL 做比較省一輪往返 */
            AND NOT EXISTS (
              SELECT 1 FROM notifications n
               WHERE n.user_ref_id = r.user_ref_id
                 AND n.provider = $2
                 AND n.external_event_id = 'mission:' || m.id
            )
       ORDER BY distance_m
          LIMIT $3`,
        [NEAR_COMMUTE_METERS, PROVIDER, MAX_PER_ROUND],
      )

      result.candidates = rows.length

      for (const row of rows) {
        if (!shouldRecommend(row, now)) {
          result.skipped += 1
          continue
        }

        /*
         * 座標一起帶：被推薦的任務不一定落在使用者當下位置的「附近」範圍內
         * （推薦是以通勤路線為中心算的），沒有座標的話探索頁查不到它，
         * 面板就打不開。帶了就能先把地圖移過去。
         */
        const params = new URLSearchParams({
          mission: row.mission_id,
          lat: String(row.lat),
          lon: String(row.lon),
        })
        const outcome = await upsertNotification(client, {
          userRefId: row.user_ref_id,
          kind: 'mission_nearby',
          title: `${row.mission_name}就在你的通勤路上`,
          body:
            `距離 ${distanceText(Number(row.distance_m))}，屬於「${row.campaign}」。` +
            '順路過去看看？',
          /*
           * 導到探索頁並打開這個任務的面板，而不是直接進叫車 ——
           * 那個面板會誠實比較走路、捷運、叫車，讓使用者自己選。
           * 主動推薦已經佔了使用者的注意力，不該再順手把他推進消費。
           */
          actionRoute: `/explore?${params}`,
          actionLabel: '看怎麼去',
          provider: PROVIDER,
          externalEventId: missionEventId(row.mission_id),
          /* 這不是交通事件，沒有對應的 disruption */
          disruptionId: null,
        })
        if (outcome === 'created') result.created += 1
        else result.skipped += 1
      }
    })
  } catch (error) {
    console.error('[mission-watch] 推薦失敗：', error)
    return { ok: false, reason: '地點推薦失敗', ...EMPTY }
  }

  return result
}
