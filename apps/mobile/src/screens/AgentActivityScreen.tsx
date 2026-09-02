import { useEffect, useRef } from 'react'

import { ChatComposer } from '@/components/ChatComposer'
import { AssistantMessage, UserMessage } from '@/components/chat'
import { HomeHeader } from '@/components/HomeHeader'
import { sendMessage, useConversation } from '@/lib/conversation'

/*
 * 對應設計稿 frame：首頁 Agent_活動示意
 *
 * 對話從空的開始。設計稿上那三則示範訊息移除了 ——
 * 想看還原稿的版本走 /dev 的情境頁（雨天、紫外線、通勤設定）。
 */

export function AgentActivityScreen() {
  const { messages, busy, error } = useConversation()
  const bottomRef = useRef<HTMLDivElement>(null)
  const firstRender = useRef(true)

  /* 新訊息就捲到底；從別的 tab 切回來時直接跳過去，不做動畫 */
  useEffect(() => {
    if (messages.length) {
      bottomRef.current?.scrollIntoView({ behavior: firstRender.current ? 'auto' : 'smooth' })
    }
    firstRender.current = false
  }, [messages.length])

  return (
    <div className="flex h-full flex-col">
      <HomeHeader />

      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-4">
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <UserMessage key={i}>{m.content}</UserMessage>
          ) : (
            <AssistantMessage key={i}>
              {m.content || <span className="text-subtle">思考中...</span>}
            </AssistantMessage>
          ),
        )}

        {error && (
          <p className="rounded-xl bg-primary-tint px-4 py-3 text-[13px] text-primary">
            {error}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      <ChatComposer onSend={sendMessage} disabled={busy} />
    </div>
  )
}
