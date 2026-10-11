import { useState } from 'react'
import { useNavigate } from 'react-router'

import { ChatComposer } from '@/components/ChatComposer'
import { AssistantMessage } from '@/components/chat'
import { HomeHeader } from '@/components/HomeHeader'
import { PLACES } from '@/lib/explorePlan'
import { RAINY_SCENARIO } from '@/lib/rainyCommute'

/*
 * 對應設計稿 frame：首頁 Agent回覆模組02（Figma 613-733，05B 系統定時推播）
 *
 * 系統依興趣與天氣主動推一個去處，使用者不用先開口。
 * 跟 /rainy 一樣是**腳本化的情境還原**：還沒有定時推播的排程與通知授權
 * （設計稿也把「推播週期、通知授權、頻率與關閉設定」列為待補）。
 *
 * 推薦的店家跟探索頁「附近靈感」是同一批示意景點（lib/explorePlan 的 PLACES），
 * 「換一個推薦」只在室內的那幾個之間換 —— 下雨天推步道沒有道理。
 * 「查看店家與交通資訊」帶到探索頁的附近靈感，那裡可以加進小行程、再看怎麼去。
 */

const INDOOR = PLACES.filter((p) => p.indoor)

export function PushRecommendScreen() {
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const place = INDOOR[index % INDOOR.length]

  return (
    <div className="flex h-full flex-col">
      <HomeHeader
        greeting="早安，小婷"
        location={`板橋區 ${RAINY_SCENARIO.temperatureC}°C`}
        sky="rain"
        alert={{ title: `降雨機率 ${RAINY_SCENARIO.rainChance}%`, body: '出門記得帶傘' }}
      />

      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-4">
        <AssistantMessage>
          今天有雨，找個室內角落{place.verb}吧。
          <div className="mt-2.5 rounded-2xl border border-line/50 bg-surface p-4">
            <div className="flex h-[132px] items-end rounded-xl bg-surface-3 p-2.5">
              <span className="rounded-md bg-ink/60 px-2 py-0.5 text-[11px] text-white">
                店家示意照片
              </span>
            </div>
            <h3 className="mt-3 text-[20px] font-bold">{place.name}</h3>
            <p className="mt-1 text-[13px] text-muted">{place.detail}</p>

            <dl className="mt-3 space-y-1 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px]">
              <Row label="推薦理由">{`室內${place.short}、雨天不用撐傘走太久`}</Row>
              <Row label="營業時段">10:00–18:00（示意）</Row>
              <Row label="地點資訊">板橋區；詳細地址待確認</Row>
            </dl>
            <p className="mt-2 text-[11px] text-subtle">店家、照片與營業資訊皆為示意範例，非實際商家。</p>

            <button
              type="button"
              onClick={() => navigate('/explore#nearby')}
              className="mt-3 w-full rounded-xl bg-primary py-3 text-[16px] font-bold text-white transition-transform active:scale-[.98]"
            >
              查看店家與交通資訊
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => i + 1)}
              className="mt-1 w-full py-2.5 text-[14px] font-medium text-muted"
            >
              換一個推薦
            </button>
          </div>
        </AssistantMessage>
      </div>

      <ChatComposer />
    </div>
  )
}

function Row({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-subtle">{label}｜</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}
