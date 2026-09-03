import { ChatComposer } from '@/components/ChatComposer'
import { AssistantMessage, UserMessage } from '@/components/chat'
import { HomeHeader } from '@/components/HomeHeader'
import { TransitStatus } from '@/components/TransitStatus'
import { TransportCard } from '@/components/TransportCard'
import { ClockIcon, PinIcon } from '@/components/icons'

/* 對應設計稿 frame：首頁 Agent_通勤路線設定 */

export function CommuteSetupScreen() {
  return (
    <div className="flex h-full flex-col">
      <HomeHeader
        alert={{ title: '通勤小提醒', body: '提前掌握交通狀況更安心' }}
      />

      <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-4">
        <AssistantMessage time="09:42 AM">
          嗨，志明！為了讓您每天的通勤更順暢，想先了解一下您平常的上班路線。這樣如果交通有異常，就能即時通知您改搭計程車喔！
        </AssistantMessage>

        <UserMessage time="09:43 AM">
          好啊！我每天從板橋搭捷運到市政府站上班，偶爾也會搭公車。
        </UserMessage>

        <AssistantMessage time="09:44 AM">
          收到！已為您整理板橋到市政府的通勤路線，未來如有捷運或公車誤點，會即時通知您並提供計程車替代方案：
          <TransportCard
            chip="每日通勤"
            badge="常用路線"
            badgeIcon={<span className="text-[12px]">⭐</span>}
            title="板橋 → 市政府站 (8.5 km)"
            cta="確認設定通勤路線"
          >
            <div className="flex items-center gap-4 text-[13px] text-muted">
              <span className="flex items-center gap-1">
                <ClockIcon />約 25 分鐘
              </span>
              <span className="flex items-center gap-1">
                <PinIcon />3 個轉乘站
              </span>
            </div>
            <TransitStatus line="板南線" />
          </TransportCard>
        </AssistantMessage>
      </div>

      <ChatComposer />
    </div>
  )
}
