import { useSyncExternalStore } from 'react'

import { streamAgentReply, type ChatMessage } from './agent'

/*
 * 對話狀態放在模組層而不是畫面裡。
 * 首頁只是 router 的其中一個 route，切到別的 tab 會被卸載，
 * state 擺在畫面裡的話對話紀錄就會跟著消失。
 * 放在這裡還有個好處：串流中途切走，回覆仍會寫回來，不會斷在一半。
 *
 * 只存在記憶體，重新啟動 App 就是新的對話。
 */

type ConversationState = {
  messages: ChatMessage[]
  busy: boolean
  error: string | null
}

let state: ConversationState = { messages: [], busy: false, error: null }
const listeners = new Set<() => void>()

function patch(next: Partial<ConversationState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useConversation() {
  return useSyncExternalStore(subscribe, () => state)
}

export async function sendMessage(text: string) {
  if (state.busy) return

  const next: ChatMessage[] = [...state.messages, { role: 'user', content: text }]
  patch({ messages: [...next, { role: 'assistant', content: '' }], busy: true, error: null })

  try {
    let reply = ''
    await streamAgentReply(next, (chunk) => {
      reply += chunk
      patch({ messages: [...next, { role: 'assistant', content: reply }] })
    })
  } catch (e) {
    patch({ messages: next, error: e instanceof Error ? e.message : '無法連線到 Agent' })
  } finally {
    patch({ busy: false })
  }
}

export function resetConversation() {
  patch({ messages: [], busy: false, error: null })
}
