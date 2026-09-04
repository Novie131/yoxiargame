import { hasDatabase, withTransaction } from '../db/client.ts'
import {
  findWatchedRoutes,
  upsertDisruption,
  upsertNotification,
  type WatchedRoute,
} from '../db/repositories/notifications.ts'
import { hasTdxCredentials, listMetroIncidents, type MetroIncident } from './tdx.ts'

/*
 * 主動監看捷運事件，命中使用者的通勤路線就產生通知。
 *
 * 架構上最關鍵的一件事：**一次撈全網、在自己的資料庫裡扇出**。
 * TDX 的額度是每分鐘 5 次，如果每個使用者的路線各查一次，幾十個人就爆了。
 * Alert 這支本來回的就是全網事件，所以外部成本固定，跟使用者數量無關。
 *
 * 另外，這裡的輪詢間隔刻意不小於 tdx.ts 的 ALERT_TTL_MS（60 秒）：
 * 那樣輪詢會直接命中使用者請求也在用的那份快取，實際額外呼叫接近零。
 */

/* 台北時間。這是給台灣使用者用的服務，不跟著伺服器所在時區跑。 */
const TIMEZONE = 'Asia/Taipei'

/*
 * 靜音時段。
 *
 * 半夜三點推「板南線有事件通報」是負分 —— 使用者當下什麼也做不了，
 * 只會學到「這個 App 的通知要關掉」。所以就算使用者沒設定通勤時段，
 * 也有這個底線。使用者自己設的時段可以更窄，但不能突破這個範圍。
 *
 * 大夜班的人設了跨午夜的時段（例如 22:00–02:00）時，以他自己的設定為準 ——
 * 那是他明講的意圖，不該被預設值蓋掉。
 */
const QUIET_START = '23:00'
const QUIET_END = '06:00'

/* TDX 的事件沒有結束時間，給一個保守的存活期，避免舊事件永遠留在表裡 */
const DISRUPTION_TTL_HOURS = 6

const PROVIDER = 'tdx'

export type PollResult = {
  ok: boolean
  /** 沒跑成功時的原因，讓呼叫端能照實回報而不是假裝成功 */
  reason?: string
  incidents: number
  created: number
  updated: number
  /** 有命中路線但在靜音／非通勤時段，所以沒發 */
  skippedQuiet: number
}

type Now = { day: string; time: string }

/** 台北此刻的星期（mon…sun）與時間（HH:MM） */
function taipeiNow(at: Date): Now {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    day: get('weekday').toLowerCase(),
    time: `${get('hour')}:${get('minute')}`,
  }
}

/**
 * time 是否落在 [start, end] 之內。
 * start > end 代表跨午夜（22:00–02:00），這時候是「兩段的聯集」而不是空集合。
 */
function withinWindow(time: string, start: string, end: string): boolean {
  return start <= end ? time >= start && time <= end : time >= start || time <= end
}

/** 現在該不該打擾這個人 */
function shouldNotify(route: WatchedRoute, now: Now): boolean {
  /* 空陣列代表每天都通勤，不是「都不通勤」 */
  if (route.usualDays.length > 0 && !route.usualDays.includes(now.day)) return false

  /* 使用者有明講時段就完全以他為準，包含刻意設在深夜的情況 */
  if (route.usualTimeStart && route.usualTimeEnd) {
    return withinWindow(now.time, route.usualTimeStart, route.usualTimeEnd)
  }

  /* 沒設定就套靜音時段：不在 23:00–06:00 之間才發 */
  return !withinWindow(now.time, QUIET_START, QUIET_END)
}

/*
 * 通知的價值不在「告訴你捷運壞了」，在「接下來怎麼辦」。
 * 所以帶著改叫車的動作，起訖站直接用這個人自己的通勤路線帶入。
 */
function rideAction(route: WatchedRoute): { actionRoute: string; actionLabel: string } {
  const params = new URLSearchParams({ from: route.origin, to: route.destination })
  return { actionRoute: `/ride/estimate?${params}`, actionLabel: '改叫計程車' }
}

const EMPTY = { incidents: 0, created: 0, updated: 0, skippedQuiet: 0 }

/**
 * 把一批事件分派成通知。
 *
 * 跟 pollTransit 分開是為了讓「決定要通知誰」這段能單獨驗證 ——
 * 真實世界大部分時候是沒有事件的（TDX 正常營運時 incidents 為空），
 * 綁在取得資料上的話，扇出與時段判斷幾乎沒機會被執行到。
 */
export async function processIncidents(
  incidents: MetroIncident[],
  at: Date = new Date(),
): Promise<PollResult> {
  const now = taipeiNow(at)
  const result: PollResult = { ok: true, ...EMPTY, incidents: incidents.length }

  for (const incident of incidents) {
    const observedAt = new Date(incident.updatedAt)
    /* TDX 偶爾回不合法的時間字串，那樣算不出存活期，跳過比寫進髒資料好 */
    if (Number.isNaN(observedAt.getTime())) {
      console.warn(`[transit-watch] 事件 ${incident.eventId} 的時間無法解析，略過`)
      continue
    }
    const expiresAt = new Date(observedAt.getTime() + DISRUPTION_TTL_HOURS * 3600_000)

    /*
     * 沒有指定範圍的事件視為全網通用（跟 getMetroStatus 的判斷一致），
     * 用一個 null 的假路線跑一輪，讓所有已設定路線的人都收得到。
     */
    const targets =
      incident.lines.length > 0
        ? incident.lines
        : [{ lineId: null as string | null, lineName: null as string | null }]

    for (const target of targets) {
      try {
        await withTransaction(async (client) => {
          const disruptionId = await upsertDisruption(client, {
            provider: PROVIDER,
            externalEventId: incident.eventId,
            lineId: target.lineId,
            /* 捷運事件是以線為單位通報的，通常沒有特定站 */
            stationId: null,
            transportMode: 'metro',
            title: incident.title,
            description: incident.description,
            status: 'alert',
            observedAt: observedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
          })

          const routes = await findWatchedRoutes(client, target.lineName)

          for (const route of routes) {
            if (!shouldNotify(route, now)) {
              result.skippedQuiet += 1
              continue
            }

            const outcome = await upsertNotification(client, {
              userRefId: route.userRefId,
              kind: 'transit_disruption',
              title: target.lineName ? `${target.lineName}有異常` : '捷運有異常',
              /* 描述有時是空的，退回標題，不要送出空白通知 */
              body: incident.description || incident.title,
              ...rideAction(route),
              provider: PROVIDER,
              externalEventId: incident.eventId,
              disruptionId,
            })
            if (outcome === 'created') result.created += 1
            else result.updated += 1
          }
        })
      } catch (error) {
        /* 單一事件寫入失敗不該讓整輪停掉，其他事件還是要處理 */
        console.error(`[transit-watch] 事件 ${incident.eventId} 寫入失敗：`, error)
      }
    }
  }

  return result
}

export async function pollTransit(at: Date = new Date()): Promise<PollResult> {
  if (!hasDatabase()) return { ok: false, reason: '未設定 DATABASE_URL', ...EMPTY }
  if (!hasTdxCredentials()) return { ok: false, reason: '未設定 TDX 金鑰', ...EMPTY }

  try {
    return await processIncidents(await listMetroIncidents(), at)
  } catch (error) {
    console.error('[transit-watch] 取得事件失敗：', error)
    return { ok: false, reason: '無法取得 TDX 事件', ...EMPTY }
  }
}
