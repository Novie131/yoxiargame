import { useNavigate } from 'react-router'

import { ChatComposer } from '@/components/ChatComposer'
import { AssistantMessage, UserMessage } from '@/components/chat'
import { HomeHeader } from '@/components/HomeHeader'
import { SituationBanner } from '@/components/SituationBanner'
import { TransitStatus } from '@/components/TransitStatus'
import { TransportCard } from '@/components/TransportCard'

/*
 * 對應設計稿 frame：rainy-commute-notification
 *
 * 這一頁是**腳本化的情境還原**，對話內容照設計稿寫死（志明、09:42、板橋→市政府）。
 * 它的用途是展示「情境觸發 → 建議 → 一鍵叫車」的敘事，不是真的在跑對話。
 *
 * 但「立即叫車」之後那一段是真的：CTA 會把起訖站名帶進叫車流程，
 * 估價頁自己查座標並依公告費率算 —— 所以那邊的數字跟這張卡不會一樣。
 *
 * 因此這張卡上的車資與時間**拿掉了**（設計稿寫的是 8.5 公里 / NT$350 / 35 分鐘，
 * 而板橋到市政府實際約 15 公里）。留著的話，demo 裡前後兩個畫面會互相打臉；
 * 這頁本來就沒有資料來源，該給數字的是下一頁。
 */

export function RainyCommuteScreen() {
  const navigate = useNavigate()

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--color-page-cool)' }}>
      <div className="bg-surface">
        <HomeHeader
          greeting="午安，志明"
          location="臺北市信義區 26°C"
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
            title="板橋 → 市政府站"
            cta="立即叫車"
            /* 帶著起訖站名進叫車流程；估價頁會自己查座標並算真實車資 */
            onCta={() =>
              navigate(`/ride/estimate?${new URLSearchParams({ from: '板橋', to: '市政府' })}`)
            }
          >
            <ul className="space-y-1 text-[13px] text-muted">
              <li className="flex gap-1.5">
                <span>・</span>
                雨天路面濕滑，建議改搭計程車
              </li>
              <li className="flex gap-1.5">
                <span>・</span>
                車資與車程於下一頁依實際距離估算
              </li>
            </ul>
          </TransportCard>
        </AssistantMessage>

        <UserMessage time="09:43 AM">好的，幫我叫車！</UserMessage>
      </div>

      <ChatComposer />
    </div>
  )
}
