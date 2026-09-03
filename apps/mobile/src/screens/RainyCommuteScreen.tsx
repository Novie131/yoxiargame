import { useNavigate } from 'react-router'

import { ChatComposer } from '@/components/ChatComposer'
import { AssistantMessage, UserMessage } from '@/components/chat'
import { HomeHeader } from '@/components/HomeHeader'
import { SituationBanner } from '@/components/SituationBanner'
import { TransitStatus } from '@/components/TransitStatus'
import { TransportCard } from '@/components/TransportCard'

/* 對應設計稿 frame：rainy-commute-notification */

const details = [
  '預估車資：約 NT$350',
  '預計抵達時間：約 35 分鐘',
  '預計抵達：09:50',
]

export function RainyCommuteScreen() {
  const navigate = useNavigate()

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--color-page-cool)' }}>
      <div className="bg-surface">
        <HomeHeader
          greeting="午安，志明"
          location="台北市信義區 26°C"
          alert={{ title: '雨天通勤提醒', body: '路面濕滑改搭乘計程車' }}
        />
      </div>

      <SituationBanner tone="cool" icon="🌂">
        今日信義區預計降雨至 11:00 AM，路面濕滑請安全出行。
      </SituationBanner>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <AssistantMessage card time="09:42 AM">
          志明，根據氣象資料，您的通勤路線沿途目前開始下雨了！🌂
          預計降雨將持續約 1 小時。考慮到雨天路況，建議您今天改搭計程車前往公司。
        </AssistantMessage>

        <AssistantMessage card time="09:42 AM">
          您平常搭的板南線目前狀況如下：
          <TransitStatus line="板南線" />
        </AssistantMessage>

        <AssistantMessage card time="09:43 AM">
          推薦您使用合作的 Yoxi 的計程車方案，一鍵呼叫省時又方便：
          <TransportCard
            chip="🚕 計程車"
            badge="推薦乘車"
            title="板橋 → 市政府站 (8.5 km)"
            cta="立即叫車"
            onCta={() => navigate('/ride/estimate')}
          >
            <ul className="space-y-1 text-[13px] text-muted">
              {details.map((d) => (
                <li key={d} className="flex gap-1.5">
                  <span>・</span>
                  {d}
                </li>
              ))}
            </ul>
          </TransportCard>
        </AssistantMessage>

        <UserMessage time="09:43 AM">好的，幫我叫車！</UserMessage>
      </div>

      <ChatComposer />
    </div>
  )
}
