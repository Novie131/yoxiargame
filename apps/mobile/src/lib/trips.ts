import { useSyncExternalStore } from 'react'

/*
 * 今天的行程。
 *
 * 跟「常用路線」是**兩種不同的東西**，刻意分開存：
 *
 *   常用路線  重複發生、有星期與時段、驅動異常通知、一人一條（lib/commute.ts）
 *   今天的行程 一次性、使用者自己選定了哪一條路線、當天過了就沒了
 *
 * 混在一起的話，「幫我安排西門町到北車」會覆蓋掉他每天上班的那條路線 ——
 * 那是他早上唯一會看的東西。
 *
 * 為什麼存在前端而不是資料庫：
 * 部署在 Cloudflare Workers 上沒有資料庫（pg 需要 TCP 連線），而且目前
 * 沒有身分驗證 —— X-User-Ref 是裝置識別，不是帳號，所以就算寫進資料庫
 * 也不會跨裝置同步。等到要做「提醒你該出發了」那種伺服器端的功能時，
 * 才真的需要把它搬進資料庫。
 */

export type PlannedTrip = {
  id: string
  /** 使用者講的地點，可能是「目前位置」 */
  from: string
  to: string
  fromStation: string
  toStation: string
  /** 這條路線經過哪幾條線，依序 */
  lines: string[]
  transfers: number
  /** 門到門的估計分鐘數 */
  totalMinutes: number
  /** 臺北時區的 YYYY-MM-DD。跨日之後這筆就不算「今天的行程」了。 */
  date: string
  addedAt: number
}

const KEY = 'yoxi.trips'

/* 一天塞十筆以上不是在規劃行程，是在洗版。擋一下避免 localStorage 無限長大。 */
const MAX_TRIPS = 10

/** 臺北時區的今天（YYYY-MM-DD）。不能用 toISOString，那是 UTC。 */
function todayInTaipei(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

function read(): PlannedTrip[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    const today = todayInTaipei()
    return parsed.filter(
      (t): t is PlannedTrip =>
        typeof t === 'object' &&
        t !== null &&
        typeof (t as PlannedTrip).id === 'string' &&
        /* 昨天的行程讀進來就丟掉，不用另外做清理排程 */
        (t as PlannedTrip).date === today,
    )
  } catch {
    return []
  }
}

function write(trips: PlannedTrip[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(trips))
  } catch {
    /* 存不進去就只有這次工作階段有效，不值得為此中斷流程 */
  }
}

let trips: PlannedTrip[] = read()
const listeners = new Set<() => void>()

function patch(next: PlannedTrip[]) {
  trips = next
  write(next)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export type NewTrip = Omit<PlannedTrip, 'id' | 'date' | 'addedAt'>

/*
 * 同一天、同一組起訖只留一筆。
 *
 * 使用者在卡片上切換路線再按一次「加入行程」，意思是「改成這一條」，
 * 不是「再加一筆一模一樣的」。用起訖站當鍵而不是使用者講的地名 ——
 * 「北車」跟「臺北車站」是同一個地方。
 */
const keyOf = (t: { fromStation: string; toStation: string }) =>
  `${t.fromStation}→${t.toStation}`

/** 加入（或以同一組起訖覆蓋）一筆今天的行程，回傳存好的那筆。 */
export function addTrip(input: NewTrip): PlannedTrip {
  const trip: PlannedTrip = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: todayInTaipei(),
    addedAt: Date.now(),
  }

  const rest = trips.filter((t) => keyOf(t) !== keyOf(trip))
  patch([trip, ...rest].slice(0, MAX_TRIPS))
  return trip
}

export function removeTrip(id: string) {
  patch(trips.filter((t) => t.id !== id))
}

export function useTrips(): PlannedTrip[] {
  return useSyncExternalStore(subscribe, () => trips)
}
