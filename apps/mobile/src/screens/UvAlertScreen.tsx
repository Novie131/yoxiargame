import { useNavigate } from 'react-router'

import { ChatComposer } from '@/components/ChatComposer'
import { AssistantMessage, UserMessage } from '@/components/chat'
import { HomeHeader } from '@/components/HomeHeader'
import { SituationBanner } from '@/components/SituationBanner'
import { TransportCard } from '@/components/TransportCard'
import { ClockIcon } from '@/components/icons'

/*
 * 對應設計稿 frame：uv-alert-commute-notification
 *
 * 跟雨天那頁一樣是**腳本化的情境還原**，對話照設計稿寫死。
 * 但兩顆 CTA 是真的：路線詳情進行程頁的規劃，計程車那張進叫車流程 ——
 * 這一頁原本兩顆都按不動，demo 走到這裡就斷了。
 *
 * 車資與距離同樣拿掉了（設計稿寫 8.5 公里 / NT$320，實際約 15 公里），
 * 理由跟雨天那頁一樣：該給數字的是下一頁。
 */

export function UvAlertScreen() {
  const navigate = useNavigate()

  /* 情境設定的通勤路線，兩顆 CTA 共用 */
  const ride = `/ride/estimate?${new URLSearchParams({ from: '板橋', to: '市政府' })}`

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--color-page-warm)' }}>
      <HomeHeader
        greeting="午安，志明"
        location="臺北市信義區 34°C"
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
            title="板橋 → 市政府站"
            cta="查看路線詳情"
            /* 公車路線的細節在行程頁，那裡查的是真實的 TDX 狀態 */
            onCta={() => navigate('/trips')}
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

          {/* 次要選項：不是主推薦，所以是灰底、較弱的樣式，但按得動 */}
          <button
            type="button"
            onClick={() => navigate(ride)}
            className="mt-3 flex w-full items-center gap-3 rounded-xl bg-surface-3 px-3 py-3 text-left transition-transform active:scale-[.99]"
          >
            <span className="text-[20px]">🚕</span>
            <div>
              <p className="text-[14px] font-semibold">或搭計程車，全程不曬太陽</p>
              <p className="mt-0.5 text-[12px] text-subtle">車資與車程於下一頁依實際距離估算</p>
            </div>
          </button>
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
