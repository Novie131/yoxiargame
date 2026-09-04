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

export type AgentEvent =
  | { type: 'text'; value: string }
  | { type: 'commute_route'; route: CommuteRoute }
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
