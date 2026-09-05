import { API_URL } from './api'
import { parseRoute, type CommuteRoute } from './commute'
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
 * 只有三種工具會產生卡片（路線規劃、附近任務、路況）—— 判斷標準是
 * 「這個結果有沒有後續動作，或有沒有結構化到值得排版」。
 * 天氣、通勤路線用一句話講得完，做成卡片只是裝飾。
 */
export type RoutePlanCard = {
  kind: 'route_plan'
  from: string
  to: string
  totalMinutes: number
  transfers: number
  legs: Array<{ line: string; from: string; to: string; stops: number; minutes: number }>
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

export type AgentCard = RoutePlanCard | MissionsCard | TransitStatusCard

export type AgentEvent =
  | { type: 'text'; value: string }
  | { type: 'commute_route'; route: CommuteRoute }
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
  if (type === 'card') {
    const card = (parsed as { card?: unknown }).card
    /*
     * 只認得的種類才放行。後端之後加新卡片時，舊版前端會安靜忽略而不是崩潰。
     * 欄位不逐一驗證 —— 這是我們自己的後端，形狀由 AgentCard 型別保證。
     */
    if (typeof card === 'object' && card !== null) {
      const kind = (card as { kind?: unknown }).kind
      if (kind === 'route_plan' || kind === 'missions' || kind === 'transit_status') {
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
  const res = await fetch(`${API_URL}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...userHeaders() },
    body: JSON.stringify({ messages }),
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
