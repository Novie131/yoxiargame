import { ChatComposer } from '@/components/ChatComposer'
import { AssistantMessage, UserMessage } from '@/components/chat'
import { HomeHeader } from '@/components/HomeHeader'
import { SituationBanner } from '@/components/SituationBanner'
import { TransportCard } from '@/components/TransportCard'
import { ClockIcon } from '@/components/icons'

/* 對應設計稿 frame：uv-alert-commute-notification */

export function UvAlertScreen() {
  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--color-page-warm)' }}>
      <HomeHeader
        greeting="午安，志明"
        location="台北市信義區 34°C"
        alert={{ title: '紫外線通勤提醒', body: '過量級防曬對策' }}
      />

      <SituationBanner tone="warm" icon="☀">
        今日紫外線指數達「過量級」(UVI 9)，外出請做好防曬措施。
      </SituationBanner>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <AssistantMessage card avatar="🧒" time="11:43 AM">
          考慮到烈日曝曬，建議您今天改搭公車或計程車，避免步行及騎車時長時間暴露在陽光下。
          <TransportCard
            chip="🚌 建議路線"
            badge="省錢防曬"
            title="板橋 → 市政府站 (8.5 km)"
            cta="查看路線詳情"
          >
            <div className="flex items-center gap-4 text-[13px] text-muted">
              <span className="flex items-center gap-1">
                <ClockIcon />約 30 分鐘
              </span>
              <span className="flex items-center gap-1">
                <span>🚌</span>公車 307 直達
              </span>
            </div>
          </TransportCard>

          {/* 次要選項：不是主推薦，所以是灰底無 CTA */}
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface-3 px-3 py-3">
            <span className="text-[20px]">🚕</span>
            <div>
              <p className="text-[14px] font-semibold">或搭計程車 約 25 分鐘</p>
              <p className="mt-0.5 text-[12px] text-subtle">預估車資：約 NT$320</p>
            </div>
          </div>
        </AssistantMessage>

        <UserMessage time="11:43 AM">好的，我搭公車！</UserMessage>

        <AssistantMessage card avatar="🧒" time="11:44 AM">
          好的！307 公車預計 5 分鐘後到站。☀ 記得做好防曬，祝您通勤順利！
        </AssistantMessage>
      </div>

      <ChatComposer />
    </div>
  )
}
