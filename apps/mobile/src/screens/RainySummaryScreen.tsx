import { useNavigate } from 'react-router'

import { ChatComposer } from '@/components/ChatComposer'
import { AssistantMessage } from '@/components/chat'
import { HomeHeader } from '@/components/HomeHeader'
import { RAINY_SCENARIO } from '@/lib/rainyCommute'

/*
 * 對應設計稿 frame：首頁 Agent回覆模組01（Figma 613-704 的「01 天氣摘要入口」）
 *
 * 雨天四頁（/rainy/commute 起）的入口：先給今天的天氣摘要，再讓使用者自己決定
 * 要看通勤建議還是逐時天氣 —— 設計稿的原則是「天氣提醒不等於自動叫車」。
 *
 * 跟 /rainy 一樣是**腳本化的情境還原**：天氣數字全部來自 RAINY_SCENARIO，
 * 跟後面四頁是同一個 08:00、22°C、降雨 80% 的早上，不會前後對不上。
 */

export function RainySummaryScreen() {
  const navigate = useNavigate()
  const s = RAINY_SCENARIO

  return (
    <div className="flex h-full flex-col">
      <HomeHeader
        greeting="早安，小婷"
        location={`板橋區 ${s.temperatureC}°C`}
        sky="rain"
        alert={{ title: `降雨機率 ${s.rainChance}%`, body: '出門記得帶傘' }}
      />

      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-4">
        <AssistantMessage>
          今天有雨，出門記得帶傘。
          <div className="mt-2.5 rounded-2xl border border-line/50 bg-surface p-4">
            <p className="inline-block rounded-md bg-surface-3 px-2 py-0.5 text-[12px] font-semibold">
              板橋區・今天 {s.time}
            </p>
            <p className="mt-2 text-[34px] font-bold leading-none">
              {s.temperatureC}° <span className="text-[24px]">{s.condition}</span>
            </p>
            <p className="mt-2 text-[13px] text-muted">
              體感 {s.feelsLikeC}°｜降雨機率 {s.rainChance}%
            </p>

            <div className="mt-3 space-y-2">
              <Advice title="穿著建議">{s.outfit}</Advice>
              <Advice title="出行建議">雨天通勤，看看最適合你的交通方案。</Advice>
            </div>
            <p className="mt-2 text-[11px] text-subtle">
              天氣資料更新 {s.updatedAt}（情境示範）
            </p>

            <button
              type="button"
              onClick={() => navigate('/rainy/commute')}
              className="mt-3 w-full rounded-xl bg-primary py-3 text-[16px] font-bold text-white transition-transform active:scale-[.98]"
            >
              查看通勤建議
            </button>
            <button
              type="button"
              onClick={() => navigate('/rainy/weather')}
              className="mt-1 w-full py-2.5 text-[14px] font-medium text-muted"
            >
              查看逐時天氣
            </button>
          </div>
        </AssistantMessage>
      </div>

      <ChatComposer />
    </div>
  )
}

function Advice({ title, children }: { title: string; children: string }) {
  return (
    <div className="rounded-xl bg-primary-tint px-3 py-2.5">
      <p className="text-[14px] font-bold">{title}</p>
      <p className="mt-0.5 text-[13px] text-muted">{children}</p>
    </div>
  )
}
