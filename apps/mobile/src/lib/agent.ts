import { API_URL } from './api'
import { parseRoute, type CommuteRoute } from './commute'
import { currentLocation } from './location'
import { userHeaders } from './userRef'

/*
 * 呼叫 apps/api 的 /agent/chat。
 *
 * 回應是 NDJSON —— 一行一個 JSON 事件，不是純文字。
 * 之所以要有結構：模型在對話中呼叫工具把通勤路線存好時，前端必須知道，
 * 才能立刻更新畫面。純文字串流看不到這件事，使用者會以為沒設定成功。
 */

export type ChatRole = 'user' | 'assistant'
export type ChatMessage = { role: ChatRole; content: string }

/*
 * 對話裡的動作卡片。形狀必須跟後端 agent/index.ts 的 AgentCard 一致。
 *
 * 判斷標準是「這個結果有沒有後續動作，或有沒有結構化到值得排版」。
 * 通勤路線用一句話講得完，做成卡片只是裝飾，所以它沒有卡片。
 * 天氣本來也不在裡面，加進來是因為它從「一個溫度」變成了
 * 「現況 + 未來幾小時 + 好幾則建議」—— 那已經講不完了。
 */
export type RouteOption = {
  /** 門到門：走到起站 + 等車 + 車程 + 出站走到目的地 */
  totalMinutes: number
  /** 只有車程與轉乘站內步行 */
  rideMinutes: number
  /** 依真實班距推導的期望等車。班距拿不到時為 0。 */
  waitMinutes: number
  transfers: number
  /** 這條路線的第一段此刻還有沒有車 */
  service: 'running' | 'closed' | 'unknown'
  legs: Array<{ line: string; from: string; to: string; stops: number; minutes: number }>
}

/** 捷運此刻的營運狀態。形狀必須跟後端的 MetroService 一致。 */
export type MetroService =
  | { status: 'running' | 'unknown' }
  | { status: 'closed'; station: string; line: string; firstTrain: string; lastTrain: string }

export type RoutePlanCard = {
  kind: 'route_plan'
  /** 使用者講的地點，可能是「目前位置」 */
  from: string
  to: string
  fromStation: string
  toStation: string
  fromWalkMinutes: number
  toWalkMinutes: number
  /** [0] 是建議路線，其餘讓使用者自己選 */
  routes: RouteOption[]
  /** 現在是不是尖峰時段 */
  peak: boolean
  service: MetroService
}

export type WeatherCard = {
  kind: 'weather'
  place: string
  temperatureC: number
  feelsLikeC: number
  condition: string
  uvIndex: number
  uvLevel: string
  advices: Array<{ kind: string; title: string; body: string }>
  outlook: {
    hours: number
    minTemperatureC: number
    maxTemperatureC: number
    maxPrecipitationProbability: number
    rainStartsAt: string | null
  } | null
}

/* 缺位置時後端會送這張，前端渲染成「開啟定位」與「手動選擇」兩個動作 */
export type LocationRequestCard = {
  kind: 'location_request'
  message: string
}

/*
 * 工具查不到東西時後端會送這張。
 * 模型在工具失敗時會自己編一段路線出來（實測過），這張卡是讓使用者
 * 不論模型講什麼都看得到「這次沒查到」。
 */
export type NoticeCard = {
  kind: 'notice'
  message: string
}

export type MissionsCard = {
  kind: 'missions'
  area: string
  missions: Array<{
    id: string
    name: string
    campaign: string
    /* 相對於查詢的地區，不是相對於使用者 */
    distanceFromAreaMeters: number
    lat: number
    lon: number
  }>
}

export type TransitStatusCard = {
  kind: 'transit_status'
  line: string
  mode: 'metro' | 'bus'
  status: 'normal' | 'alert'
  note: string
  incidents: Array<{ title: string; description: string }>
}

export type AgentCard =
  | RoutePlanCard
  | WeatherCard
  | MissionsCard
  | TransitStatusCard
  | LocationRequestCard
  | NoticeCard

/** 模型把一趟行程加進「今天的行程」。形狀必須跟後端的 PlannedTripEvent 一致。 */
export type PlannedTripEvent = {
  from: string
  to: string
  fromStation: string
  toStation: string
  lines: string[]
  transfers: number
  totalMinutes: number
}

export type AgentEvent =
  | { type: 'text'; value: string }
  | { type: 'commute_route'; route: CommuteRoute }
  | { type: 'planned_trip'; trip: PlannedTripEvent }
  | { type: 'card'; card: AgentCard }
  | { type: 'error'; message: string }

/* 一行 JSON → 事件。不認得的形狀一律忽略，後端加新事件時舊前端也不會壞。 */
function parseEvent(line: string): AgentEvent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null

  const { type } = parsed as { type?: unknown }

  if (type === 'text') {
    const { value } = parsed as { value?: unknown }
    return typeof value === 'string' ? { type: 'text', value } : null
  }
  if (type === 'commute_route') {
    const route = parseRoute((parsed as { route?: unknown }).route)
    return route ? { type: 'commute_route', route } : null
  }
  if (type === 'planned_trip') {
    const trip = (parsed as { trip?: unknown }).trip
    /* 只驗最低限度的形狀 —— 這是我們自己的後端，欄位由型別保證 */
    if (typeof trip === 'object' && trip !== null) {
      const t = trip as PlannedTripEvent
      if (t.fromStation && t.toStation) return { type: 'planned_trip', trip: t }
    }
    return null
  }
  if (type === 'card') {
    const card = (parsed as { card?: unknown }).card
    /*
     * 只認得的種類才放行。後端之後加新卡片時，舊版前端會安靜忽略而不是崩潰。
     * 欄位不逐一驗證 —— 這是我們自己的後端，形狀由 AgentCard 型別保證。
     */
    if (typeof card === 'object' && card !== null) {
      const kind = (card as { kind?: unknown }).kind
      if (
        kind === 'route_plan' ||
        kind === 'weather' ||
        kind === 'missions' ||
        kind === 'transit_status' ||
        kind === 'location_request' ||
        kind === 'notice'
      ) {
        return { type: 'card', card: card as AgentCard }
      }
    }
    return null
  }
  if (type === 'error') {
    const { message } = parsed as { message?: unknown }
    return { type: 'error', message: typeof message === 'string' ? message : '發生錯誤' }
  }
  return null
}

export async function streamAgentReply(
  messages: ChatMessage[],
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  /*
   * 位置跟著每一次發話帶上去。
   *
   * 刻意每次都重新讀而不是在建立對話時取一次：使用者是會移動的，
   * 而且他可能中途才按下「開啟定位」——那之後的每一句話都該用得到。
   *
   * 退路座標（信義區）**不送**。送了的話後端會以為使用者真的在信義區，
   * 然後給他一條從市政府站出發的路線，而他人在臺中。寧可讓後端回
   * need_location，畫面跳出「開啟定位／手動選擇」讓他自己說。
   */
  const here = currentLocation()
  const location =
    here.source === 'fallback'
      ? undefined
      : { lat: here.lat, lon: here.lon, precise: here.precise, label: here.label }

  const res = await fetch(`${API_URL}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...userHeaders() },
    body: JSON.stringify({ messages, location }),
    signal,
  })

  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(detail?.error ?? `伺服器回應 ${res.status}`)
  }
  if (!res.body) throw new Error('伺服器沒有回傳內容')

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  /* 一個 chunk 不保證剛好是整數行，最後那段不完整的要留到下一輪 */
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    buffer += value
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      const event = parseEvent(line)
      if (event) onEvent(event)
    }
  }

  /* 串流正常結束時最後一行不會有換行，別把它漏掉 */
  if (buffer.trim()) {
    const event = parseEvent(buffer)
    if (event) onEvent(event)
  }
}
