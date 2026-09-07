import { taipeiNow, toMinutes, type TaipeiNow } from './clock.ts'
import type { RouteLeg, RoutePlan } from './route-planner.ts'
import {
  getFirstLastTimetable,
  getFrequency,
  getStationsOfLine,
  type MetroFirstLast,
  type MetroFrequency,
} from './tdx.ts'

/*
 * 把「現在幾點」套進路線規劃。
 *
 * 在這個檔案出現之前，規劃完全沒有時間概念：邊的權重是 TDX 的靜態站間時間，
 * 轉乘等車是寫死的 120 秒。所以凌晨兩點問「西門町到北車」，會得到一條
 * 「搭板南線 3 分鐘到」的建議 —— 那個時間捷運早就收班了。
 * 那不是誤差，是一個確定錯誤的答案，比回「不知道」糟得多。
 *
 * 這裡負責三件事：
 *   1. 現在這條路線還有沒有車（首末班車 + 行駛日）
 *   2. 上車要等多久（真實班距，分平日／假日、分尖峰／離峰）
 *   3. 現在是不是尖峰
 *
 * 誠實範圍：
 *   首末班車、行駛日、班距區間  真實數據（TDX FirstLastTimetable / Frequency）
 *   等車時間                   由班距推導的**期望值**（班距的一半），不是實際等待
 *   國定假日                   判斷不了，見 clock.ts 的註解
 */

/*
 * 這兩份資料任何一份拿不到，就退成「不確定」而不是報錯。
 *
 * 冷啟動時路網圖已經要吃 4 次 TDX，加上這兩支是 6 次，會超過每分鐘 5 次的
 * 上限，第一次查詢很可能拿不到。那時候路線照樣要算得出來，只是不做時間判斷 ——
 * 資料快取一天，下一次查詢就會補上。
 */
export type ServiceState =
  | { status: 'running' }
  /*
   * 不營運。
   *
   * 刻意不分「已收班」與「還沒發車」：跨午夜的營運時間（06:08–00:46）
   * 讓這個區分很容易講反 —— 凌晨 2:30 到底算昨天收班了還是今天還沒開？
   * 兩種說法都對，而使用者真正需要的資訊是同一個：現在沒有車，首班幾點。
   * 與其猜一個可能講錯的說法，不如把首末班車都給出來。
   */
  | {
      status: 'closed'
      /** 哪一站、哪條線判定的 */
      station: string
      line: string
      firstTrain: string
      lastTrain: string
    }
  /** 班表拿不到，或這一站在班表裡查無資料 —— 不要假裝知道 */
  | { status: 'unknown' }

export type LegTiming = RouteLeg & {
  /** 上這一班車預期要等幾分鐘（班距的一半）。查不到班距時為 null。 */
  waitMinutes: number | null
}

export type ScheduledPlan = {
  from: string
  to: string
  /** 車程 + 轉乘站內步行。不含等車。 */
  rideMinutes: number
  /** 等第一班車 + 每次轉乘的等車，全部是期望值 */
  waitMinutes: number
  /** rideMinutes + waitMinutes */
  totalMinutes: number
  transfers: number
  legs: LegTiming[]
  /** 現在是不是尖峰時段（依第一段所在路線的班距表） */
  peak: boolean
  service: ServiceState
}

/* ── 站序：判斷方向要用 ─────────────────────────────────────── */

type LineOrder = Map<string, string[]>

let orderCache: { at: number; value: LineOrder } | null = null
const ORDER_TTL_MS = 24 * 60 * 60 * 1000

async function lineOrder(): Promise<LineOrder> {
  if (orderCache && Date.now() - orderCache.at < ORDER_TTL_MS) return orderCache.value

  const groups = await getStationsOfLine()
  const value: LineOrder = new Map()
  for (const group of groups) {
    const ordered = [...group.Stations]
      .sort((a, b) => a.Sequence - b.Sequence)
      .map((s) => s.StationID)
    value.set(group.LineID, ordered)
  }

  orderCache = { at: Date.now(), value }
  return value
}

/*
 * 這一段是往哪個端點開。
 *
 * 首末班車是**分方向**的：同一站往南港展覽館的末班車跟往頂埔的不一樣，
 * 實測 BL01 往南港是 00:00、BL02 往頂埔是 01:12。用錯方向會把還有車的
 * 說成收班了，或反過來 —— 後者更危險。
 */
function terminusToward(order: string[], fromId: string, toId: string): string | null {
  const from = order.indexOf(fromId)
  const to = order.indexOf(toId)
  if (from < 0 || to < 0 || from === to) return null
  return to > from ? order[order.length - 1] : order[0]
}

/* ── 首末班車 ───────────────────────────────────────────────── */

function runsToday(serviceDay: MetroFirstLast['ServiceDay'], day: string): boolean {
  switch (day) {
    case 'mon': return serviceDay.Monday
    case 'tue': return serviceDay.Tuesday
    case 'wed': return serviceDay.Wednesday
    case 'thu': return serviceDay.Thursday
    case 'fri': return serviceDay.Friday
    case 'sat': return serviceDay.Saturday
    case 'sun': return serviceDay.Sunday
    /* 認不得的星期就別擋人 */
    default: return true
  }
}

/*
 * 現在是否在營運時間內。
 *
 * 末班車常常是隔天凌晨（「01:12」），所以不能拿字串直接比大小 ——
 * 那樣 00:30 會被判成早於 06:00 的首班車而說「還沒開始營運」，
 * 但其實那是昨天的末班車還在跑。一律轉成分鐘數並處理跨午夜。
 */
function withinService(nowMinutes: number, first: number, last: number): boolean {
  /* 末班在首班之後 = 不跨午夜（06:00–23:30） */
  if (last >= first) return nowMinutes >= first && nowMinutes <= last
  /* 跨午夜（06:00–01:12）：凌晨那段也算 */
  return nowMinutes >= first || nowMinutes <= last
}

/*
 * 只檢查第一段的營運狀態。
 *
 * 中途各段理論上也該檢查，但那需要「到達那一站時是幾點」，而我們算的是
 * 期望值不是時刻表推算 —— 拿一個估計時間去查末班車，會在接近收班時
 * 給出忽對忽錯的答案。第一段是使用者馬上要做的事，那個一定要對。
 */
async function serviceStateOf(leg: RouteLeg, now: TaipeiNow): Promise<ServiceState> {
  const [timetable, order] = await Promise.all([getFirstLastTimetable(), lineOrder()])

  const nowMinutes = toMinutes(now.time)
  if (nowMinutes === null) return { status: 'unknown' }

  const atStation = timetable.filter(
    (t) => t.StationID === leg.fromStationId && t.LineID === leg.lineId,
  )
  if (atStation.length === 0) return { status: 'unknown' }

  const terminus = terminusToward(order.get(leg.lineId) ?? [], leg.fromStationId, leg.toStationId)
  /* 對得到方向就只看那個方向；對不到就退回這一站的所有班次（比較寬鬆但不會誤報收班） */
  const candidates = terminus
    ? atStation.filter((t) => t.DestinationStaionID === terminus)
    : atStation
  const rows = (candidates.length > 0 ? candidates : atStation).filter((t) =>
    runsToday(t.ServiceDay, now.day),
  )
  if (rows.length === 0) return { status: 'unknown' }

  for (const row of rows) {
    const first = toMinutes(row.FirstTrainTime)
    const last = toMinutes(row.LastTrainTime)
    if (first === null || last === null) continue
    if (withinService(nowMinutes, first, last)) return { status: 'running' }
  }

  /* 都不在營運時間內。挑第一筆來說明首末班車。 */
  const row = rows[0]
  if (toMinutes(row.FirstTrainTime) === null) return { status: 'unknown' }

  return {
    status: 'closed',
    station: row.StationName.Zh_tw,
    line: leg.line,
    firstTrain: row.FirstTrainTime,
    lastTrain: row.LastTrainTime,
  }
}

/* ── 班距 ───────────────────────────────────────────────────── */

function frequencyForToday(rows: MetroFrequency[], lineId: string, now: TaipeiNow) {
  const onLine = rows.filter((r) => r.LineID === lineId)
  return onLine.find((r) =>
    now.weekend ? r.ServiceDay.Saturday || r.ServiceDay.Sunday : r.ServiceDay.Monday,
  )
}

type Headway = { minutes: number; peak: boolean }

/*
 * 這條線現在的班距。
 *
 * 取 Min 與 Max 的中點：TDX 給的是一個區間（尖峰 6–6、離峰 8–10），
 * 拿 Min 會系統性低估等車時間，拿 Max 又會讓每個估計都偏悲觀。
 */
function headwayAt(rows: MetroFrequency[], lineId: string, now: TaipeiNow): Headway | null {
  const table = frequencyForToday(rows, lineId, now)
  if (!table?.Headways?.length) return null

  const nowMinutes = toMinutes(now.time)
  if (nowMinutes === null) return null

  for (const window of table.Headways) {
    const start = toMinutes(window.StartTime)
    const end = toMinutes(window.EndTime)
    if (start === null || end === null) continue

    /* 「23:00–00:00」的結束是隔天，要當成跨午夜處理 */
    const inWindow =
      end > start
        ? nowMinutes >= start && nowMinutes < end
        : nowMinutes >= start || nowMinutes < end
    if (!inWindow) continue

    const average = (window.MinHeadwayMins + window.MaxHeadwayMins) / 2
    return { minutes: average, peak: window.PeakFlag === '1' }
  }

  return null
}

/*
 * 隨機到站時的期望等待 = 班距的一半。
 *
 * 這是排隊理論裡最基本的結果（等時距到站），也是各家轉乘 App 的通用估法。
 * 它是**期望值**不是保證 —— 剛好錯過一班就是等一整個班距。
 */
const expectedWait = (headway: Headway) => Math.max(1, Math.round(headway.minutes / 2))

/* ── 對外 ───────────────────────────────────────────────────── */

/**
 * 把時間套進一條路線：算出等車時間、是否尖峰、現在還有沒有車。
 *
 * 班表或班距拿不到時不會丟例外，而是回傳 waitMinutes = 0、
 * service = unknown 的結果 —— 少一個功能，不要讓整個規劃壞掉。
 */
export async function applySchedule(
  plan: RoutePlan,
  at: Date = new Date(),
): Promise<ScheduledPlan> {
  const now = taipeiNow(at)

  const base: ScheduledPlan = {
    from: plan.from,
    to: plan.to,
    rideMinutes: plan.totalMinutes,
    waitMinutes: 0,
    totalMinutes: plan.totalMinutes,
    transfers: plan.transfers,
    legs: plan.legs.map((leg) => ({ ...leg, waitMinutes: null })),
    peak: false,
    service: { status: 'unknown' },
  }

  /*
   * 順序很重要：先查首末班車，再查班距。
   *
   * 冷啟動時路網圖已經用掉 4 次 TDX 額度，這一分鐘只剩 1 次。兩支都想要的話
   * 一定有一支拿不到，那就要決定「哪一件事比較不能不知道」——
   * 答案是收班：等車估錯幾分鐘只是不準，把已經收班的路線講成三分鐘會到，
   * 是給出一個確定錯誤的建議。所以安全關鍵的先搶額度。
   *
   * 兩份都快取一天，所以這個競爭只發生在冷啟動後的第一分鐘。
   */
  let service: ServiceState = { status: 'unknown' }
  if (plan.legs.length > 0) {
    try {
      service = await serviceStateOf(plan.legs[0], now)
    } catch (error) {
      console.error('[metro-schedule] 首末班車取得失敗：', error)
    }
  }

  let frequencies: MetroFrequency[]
  try {
    frequencies = await getFrequency()
  } catch (error) {
    console.error('[metro-schedule] 班距取得失敗：', error)
    return { ...base, service }
  }

  const legs: LegTiming[] = []
  let waitTotal = 0
  let peak = false

  for (const [index, leg] of plan.legs.entries()) {
    const headway = headwayAt(frequencies, leg.lineId, now)
    const wait = headway ? expectedWait(headway) : null
    if (wait !== null) waitTotal += wait
    /* 尖峰與否以第一段（使用者實際上車的那條線）為準 */
    if (index === 0 && headway) peak = headway.peak
    legs.push({ ...leg, waitMinutes: wait })
  }

  /*
   * 轉乘等車已經包含在 route-planner 的 TRANSFER_WAIT_SECONDS（固定 2 分）裡了，
   * 這裡用真實班距重算，所以要先把那筆估計值扣掉，否則會重複計算。
   */
  const transferEstimateAlreadyCounted = plan.transfers * TRANSFER_WAIT_MINUTES
  const rideMinutes = Math.max(0, plan.totalMinutes - transferEstimateAlreadyCounted)

  return {
    from: plan.from,
    to: plan.to,
    rideMinutes,
    waitMinutes: waitTotal,
    totalMinutes: rideMinutes + waitTotal,
    transfers: plan.transfers,
    legs,
    peak,
    service,
  }
}

/*
 * 必須跟 route-planner 的 TRANSFER_WAIT_SECONDS 一致。
 * 那個常數是規劃時的轉乘懲罰（決定要不要多轉一次車），這裡則是把它換成
 * 真實班距，兩者用途不同但數值要對得起來，否則扣減會算錯。
 */
const TRANSFER_WAIT_MINUTES = 2
