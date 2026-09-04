import { useSyncExternalStore } from 'react'

import { streamAgentReply, type ChatMessage } from './agent'
import { applyRoute } from './commute'

/*
 * 對話狀態放在模組層而不是畫面裡。
 * 畫面只是 router 的其中一個 route，切到別的 tab 會被卸載，
 * state 擺在畫面裡的話對話紀錄就會跟著消失。
 * 放在這裡還有個好處：串流中途切走，回覆仍會寫回來，不會斷在一半。
 *
 * 用工廠而不是單一個 store，是因為現在有兩個獨立的對話：
 * 首頁的一般助理，跟通勤設定畫面那個有明確目的的對話。
 * 兩邊混在一起的話，設定路線時會被前面聊過的天氣話題干擾。
 *
 * 只存在記憶體，重新啟動 App 就是新的對話。
 */

export type ConversationState = {
  messages: ChatMessage[]
  busy: boolean
  error: string | null
}

export type Conversation = ReturnType<typeof createConversation>

export function createConversation(intro?: string) {
  /* 開場白由前端寫死沒有問題 —— 它是介面文案，不是冒充成模型講過的話 */
  const initial: ChatMessage[] = intro ? [{ role: 'assistant', content: intro }] : []

  let state: ConversationState = { messages: initial, busy: false, error: null }
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

  async function send(text: string) {
    if (state.busy) return

    const next: ChatMessage[] = [...state.messages, { role: 'user', content: text }]
    patch({ messages: [...next, { role: 'assistant', content: '' }], busy: true, error: null })

    try {
      let reply = ''
      await streamAgentReply(next, (event) => {
        if (event.type === 'text') {
          reply += event.value
          patch({ messages: [...next, { role: 'assistant', content: reply }] })
        } else if (event.type === 'commute_route') {
          /*
           * 模型在這一輪把通勤路線存進後端了。同步到 store，行程頁才會
           * 立刻脫離空狀態 —— 否則使用者講完話，畫面看起來像什麼都沒發生。
           */
          applyRoute(event.route)
        } else {
          patch({ error: event.message })
        }
      })
    } catch (e) {
      patch({ messages: next, error: e instanceof Error ? e.message : '無法連線到 Agent' })
    } finally {
      patch({ busy: false })
    }
  }

  return {
    use: () => useSyncExternalStore(subscribe, () => state),
    send,
    reset: () => patch({ messages: initial, busy: false, error: null }),
  }
}

/* 首頁的一般助理對話。從空的開始，不預設任何開場白。 */
const home = createConversation()

export const useConversation = home.use
export const sendMessage = home.send
export const resetConversation = home.reset
