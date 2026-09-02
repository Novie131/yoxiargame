import { API_URL } from './api'

/* 呼叫 apps/api 的 /agent/chat，逐塊讀回純文字串流 */

export type ChatRole = 'user' | 'assistant'
export type ChatMessage = { role: ChatRole; content: string }

export async function streamAgentReply(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_URL}/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  })

  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.error ?? `伺服器回應 ${res.status}`)
  }
  if (!res.body) throw new Error('伺服器沒有回傳內容')

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) onChunk(value)
  }
}
