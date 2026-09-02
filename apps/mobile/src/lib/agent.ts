import { Capacitor } from '@capacitor/core'

/* 呼叫 apps/api 的 /agent/chat，逐塊讀回純文字串流 */

export type ChatRole = 'user' | 'assistant'
export type ChatMessage = { role: ChatRole; content: string }

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/*
 * 打包進 App 之後，localhost 指的是使用者的手機自己，永遠連不到後端。
 * 這是很容易到了真機測試才發現的錯誤，所以在啟動時就明確警告。
 * 正式版必須設定 VITE_API_URL 為公開的 HTTPS 位址
 * （iOS 的 App Transport Security 預設會擋純 HTTP）。
 */
if (Capacitor.isNativePlatform() && /localhost|127\.0\.0\.1/.test(API_URL)) {
  console.error(
    `[agent] VITE_API_URL 指向 ${API_URL}，在真機上連不到後端。` +
      '請在建置前設定 VITE_API_URL 為公開的 HTTPS 位址。',
  )
}

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
