import { useRef, useState } from 'react'

import { ChatComposer } from '@/components/ChatComposer'
import { AssistantMessage, UserMessage } from '@/components/chat'
import { HomeHeader } from '@/components/HomeHeader'
import { TransportCard } from '@/components/TransportCard'
import { ClockIcon, PinIcon } from '@/components/icons'
import { streamAgentReply, type ChatMessage } from '@/lib/agent'

/*
 * 對應設計稿 frame：首頁 Agent_活動示意
 *
 * 上半段是設計稿原本的三則訊息（固定不動，方便對照）；
 * 使用者送出訊息後，真實對話接在下面。
 */

/* 設計稿上的對話，同時也是送給 Agent 的初始脈絡 */
const seeded: ChatMessage[] = [
  {
    role: 'assistant',
    content:
      '嗨，志明！大安森林公園今天好熱鬧！GO Fest 台北慶典正好有特別加成，附近正出現稀有寶可夢喔。今天打算去哪裡探索？',
  },
  {
    role: 'user',
    content: '我想去大安森林公園，有推薦的熱門 GO Fest 路線或活動嗎？',
  },
  {
    role: 'assistant',
    content:
      '沒問題！為您推薦今日大安森林公園最熱門的活動路線，沿途有特別多的皮克敏和補給站：大安綠意捕捉線，3.2 公里，約 45 分鐘，18 個補給站。',
  },
]

export function AgentActivityScreen() {
  const [live, setLive] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const send = async (text: string) => {
    setError(null)
    const next: ChatMessage[] = [...live, { role: 'user', content: text }]
    setLive([...next, { role: 'assistant', content: '' }])
    setBusy(true)
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))

    try {
      let reply = ''
      await streamAgentReply([...seeded, ...next], (chunk) => {
        reply += chunk
        setLive([...next, { role: 'assistant', content: reply }])
      })
    } catch (e) {
      setLive(next)
      setError(e instanceof Error ? e.message : '無法連線到 Agent')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <HomeHeader />

      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-4">
        <AssistantMessage time="09:42 AM">{seeded[0].content}</AssistantMessage>

        <UserMessage time="09:43 AM">{seeded[1].content}</UserMessage>

        <AssistantMessage time="09:44 AM">
          沒問題！為您推薦今日大安森林公園最熱門的活動路線，沿途有特別多的皮克敏和補給站：
          <TransportCard
            chip="GO Fest 2026"
            badge="熱門路線"
            title="大安綠意捕捉線 (3.2 km)"
            cta="導入地圖開始探索"
          >
            <div className="flex items-center gap-4 text-[13px] text-muted">
              <span className="flex items-center gap-1">
                <ClockIcon />約 45 分鐘
              </span>
              <span className="flex items-center gap-1">
                <PinIcon />18 個補給站
              </span>
            </div>
          </TransportCard>
        </AssistantMessage>

        {live.map((m, i) =>
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

      <ChatComposer onSend={send} disabled={busy} />
    </div>
  )
}
