import { useSyncExternalStore } from 'react'

/*
 * 規劃好的行程（今天、明天）與過往行程。
 *
 * 跟「常用路線」是**兩種不同的東西**，刻意分開存：
 *
 *   常用路線  重複發生、有星期與時段、驅動異常通知、一人一條（lib/commute.ts）
 *   規劃的行程 一次性、使用者自己選定了哪一條路線、綁定某一天
 *
 * 混在一起的話，「幫我安排西門町到北車」會覆蓋掉他每天上班的那條路線 ——
 * 那是他早上唯一會看的東西。
 *
 * 為什麼存在前端而不是資料庫：
 * 部署在 Cloudflare Workers 上沒有資料庫（pg 需要 TCP 連線），而且目前
 * 沒有身分驗證 —— X-User-Ref 是裝置識別，不是帳號，所以就算寫進資料庫
 * 也不會跨裝置同步。等到要做「提醒你該出發了」那種伺服器端的功能時，
 * 才真的需要把它搬進資料庫。
 *
 * ── 跨日 ──
 * 以前跨日就把昨天的行程丟掉。現在改成依日期分流：
 *
 *   今天          「即將到來」的稍後行程（useTrips 仍然只回傳這些，叫車頁與對話卡沿用）
 *   明天          「明日行程」
 *   已經過去的日期 搬進過往行程（yoxi.trips.history），不是丟掉
 *
 * 舊資料的形狀沒變（一樣有 date），所以以前留在 localStorage 裡、
 * 只是讀的時候被濾掉的昨日行程，第一次載入就會被歸檔成過往行程。
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
  /** 臺北時區的 YYYY-MM-DD，這筆行程排在哪一天 */
  date: string
  addedAt: number
}

/*
 * 過往行程。
 *
 * endedBy 要分清楚：日期過了自動歸檔的那筆，我們**不知道**他到底有沒有去，
 * 畫面上不能寫成「已完成」。只有他自己按了「標記完成」的才算。
 */
export type PastTrip = PlannedTrip & {
  endedBy: 'done' | 'expired'
  endedAt: number
}

const KEY = 'yoxi.trips'
const HISTORY_KEY = 'yoxi.trips.history'

/* 一天塞十筆以上不是在規劃行程，是在洗版。擋一下避免 localStorage 無限長大。 */
const MAX_TRIPS_PER_DAY = 10
/* 過往行程只是回顧用，留最近的就好 */
const MAX_HISTORY = 50

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const taipeiDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 臺北時區的今天（YYYY-MM-DD）。不能用 toISOString，那是 UTC。 */
export function todayInTaipei(at: Date = new Date()): string {
  return taipeiDate.format(at)
}

/** YYYY-MM-DD 的隔天。純日期運算用 UTC 做，才不會被裝置時區或日光節約影響。 */
export function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

function isTrip(t: unknown): t is PlannedTrip {
  if (typeof t !== 'object' || t === null) return false
  const trip = t as PlannedTrip
  return (
    typeof trip.id === 'string' &&
    typeof trip.from === 'string' &&
    typeof trip.to === 'string' &&
    typeof trip.date === 'string' &&
    DATE_RE.test(trip.date) &&
    Array.isArray(trip.lines)
  )
}

function isPastTrip(t: unknown): t is PastTrip {
  if (!isTrip(t)) return false
  const { endedBy } = t as PastTrip
  return endedBy === 'done' || endedBy === 'expired'
}

function readList<T>(key: string, guard: (t: unknown) => t is T): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter(guard) : []
  } catch {
    return []
  }
}

function writeList(key: string, list: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    /* 存不進去就只有這次工作階段有效，不值得為此中斷流程 */
  }
}

/* 新的在前：日期越近越前面，同一天再看是什麼時候結束的 */
function sortHistory(list: PastTrip[]): PastTrip[] {
  return [...list]
    .sort((a, b) => (a.date === b.date ? b.endedAt - a.endedAt : a.date < b.date ? 1 : -1))
    .slice(0, MAX_HISTORY)
}

type State = {
  day: string
  /** 今天與之後的行程，原始順序（新加的在前） */
  all: PlannedTrip[]
  today: PlannedTrip[]
  tomorrow: PlannedTrip[]
  history: PastTrip[]
}

function derive(all: PlannedTrip[], history: PastTrip[], day: string): State {
  const tomorrow = nextDay(day)
  return {
    day,
    all,
    today: all.filter((t) => t.date === day),
    tomorrow: all.filter((t) => t.date === tomorrow),
    history,
  }
}

/*
 * 把日期已經過去的行程搬進過往行程。
 *
 * 讀進來的時候做、跨日的時候再做一次 —— 不用另外排清理工作。
 */
function rollover(all: PlannedTrip[], history: PastTrip[], day: string): State {
  const expired = all.filter((t) => t.date < day)
  if (expired.length === 0) return derive(all, history, day)

  const kept = all.filter((t) => t.date >= day)
  const known = new Set(history.map((t) => t.id))
  const archived: PastTrip[] = expired
    .filter((t) => !known.has(t.id))
    .map((t) => ({ ...t, endedBy: 'expired', endedAt: t.addedAt }))
  const nextHistory = sortHistory([...archived, ...history])

  writeList(KEY, kept)
  writeList(HISTORY_KEY, nextHistory)
  return derive(kept, nextHistory, day)
}

let state: State = rollover(
  readList(KEY, isTrip),
  readList(HISTORY_KEY, isPastTrip),
  todayInTaipei(),
)
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function patch(all: PlannedTrip[], history: PastTrip[] = state.history) {
  if (all !== state.all) writeList(KEY, all)
  if (history !== state.history) writeList(HISTORY_KEY, history)
  state = derive(all, history, state.day)
  emit()
}

/*
 * App 開著跨過午夜時，今天的行程要變成過往、明天的要變成今天。
 * 用計時器與回到前景時檢查，而不是在 getSnapshot 裡算 —— 那裡必須是純讀取。
 */
function checkDay() {
  const day = todayInTaipei()
  if (day === state.day) return
  state = rollover(state.all, state.history, day)
  emit()
}

if (typeof window !== 'undefined') {
  window.setInterval(checkDay, 60_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkDay()
  })
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
const keyOf = (t: { fromStation: string; toStation: string; date: string }) =>
  `${t.date}:${t.fromStation}→${t.toStation}`

/* 把 trip 放到最前面，同一天同起訖的舊那筆拿掉，並守住每天的上限 */
function placeTrip(trip: PlannedTrip, others: PlannedTrip[]): PlannedTrip[] {
  const rest = others.filter((t) => t.id !== trip.id && keyOf(t) !== keyOf(trip))
  const sameDay = rest.filter((t) => t.date === trip.date)
  const overflow = new Set(sameDay.slice(MAX_TRIPS_PER_DAY - 1).map((t) => t.id))
  return [trip, ...rest.filter((t) => !overflow.has(t.id))]
}

/** 加入（或以同一組起訖覆蓋）一筆今天的行程，回傳存好的那筆。 */
export function addTrip(input: NewTrip): PlannedTrip {
  const trip: PlannedTrip = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: state.day,
    addedAt: Date.now(),
  }
  patch(placeTrip(trip, state.all))
  return trip
}

export function removeTrip(id: string) {
  patch(state.all.filter((t) => t.id !== id))
}

/*
 * 把行程改到今天或明天。
 *
 * 目前加入行程的入口（對話卡）只會加到今天，所以「明日行程」唯一的來源
 * 就是使用者自己把今天那筆往後挪 —— 不替他猜哪一筆是明天的。
 */
export function moveTrip(id: string, when: 'today' | 'tomorrow') {
  const trip = state.all.find((t) => t.id === id)
  if (!trip) return
  const date = when === 'today' ? state.day : nextDay(state.day)
  if (trip.date === date) return
  patch(placeTrip({ ...trip, date }, state.all))
}

/** 使用者說這一趟走完了：搬進過往行程，標成「已完成」。 */
export function completeTrip(id: string) {
  const trip = state.all.find((t) => t.id === id)
  if (!trip) return
  patch(
    state.all.filter((t) => t.id !== id),
    sortHistory([{ ...trip, endedBy: 'done', endedAt: Date.now() }, ...state.history]),
  )
}

/** 今天的行程。叫車頁與對話卡都靠它判斷「今天加過了沒」，語意不要改。 */
export function useTrips(): PlannedTrip[] {
  return useSyncExternalStore(subscribe, () => state.today)
}

/** 明天的行程 */
export function useTomorrowTrips(): PlannedTrip[] {
  return useSyncExternalStore(subscribe, () => state.tomorrow)
}

/** 過往行程，新的在前 */
export function usePastTrips(): PastTrip[] {
  return useSyncExternalStore(subscribe, () => state.history)
}

/** 目前算的「今天」，畫面要算「昨天」之類的相對日期時用同一個基準 */
export function useTripDay(): string {
  return useSyncExternalStore(subscribe, () => state.day)
}
