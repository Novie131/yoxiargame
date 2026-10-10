import { useState } from 'react'
import { useNavigate } from 'react-router'

import { ChatComposer } from '@/components/ChatComposer'
import { AssistantMessage } from '@/components/chat'
import { HomeHeader } from '@/components/HomeHeader'
import { Modal } from '@/components/Modal'
import { SituationBanner } from '@/components/SituationBanner'
import { TransportCard } from '@/components/TransportCard'
import { ClockIcon } from '@/components/icons'
import { useCommuteRoute } from '@/lib/commute'
import { RESCUE_SCENARIO, rescueRideUrl, rescueRoute } from '@/lib/delayRescue'
import { FALLBACK_LABEL, useUserLocation } from '@/lib/location'
import {
  formatFare,
  markNextRideAsRescue,
  useResolvedPlace,
  useRideEstimate,
  type RidePlace,
} from '@/lib/ride'

/*
 * 對應設計稿 frame：delay-rescue-modal
 *
 * 跟雨天、紫外線兩頁一樣是**腳本化的情境還原**：底下的首頁與對話照劇本寫死，
 * 台鐵誤點的班次與時間來自 lib/delayRescue（目前沒有台鐵即時資料，見那邊的說明）。
 *
 * 但兩件事是真的：
 *   車資      跟估價頁同一組 hook 與快取，所以按下去之後看到的是同一個數字
 *   主按鈕    進真的叫車流程，並把這一趟標記為救援，最後的結算頁會顯示救援版
 *
 * 一進來就打開彈窗，因為這一頁是從鎖定畫面的推播點進來的 ——
 * 推播的用途就是把這個決定直接擺到使用者面前。
 * 按「暫時不需要」關掉之後，對話裡的卡片可以再叫出來，demo 才走得回去。
 */

export function DelayRescueScreen() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(true)
  const { route } = useCommuteRoute()
  const trip = rescueRoute(route)

  /*
   * 起訖的解析方式與估價頁一模一樣（含「查不到上車點就用目前位置」的退路），
   * 座標相同，useRideEstimate 就會命中同一份快取 —— 彈窗與估價頁的車資才會一致。
   */
  const location = useUserLocation()
  const here: RidePlace = {
    label: location.label ?? (location.precise ? '目前位置' : `${FALLBACK_LABEL}（預設位置）`),
    lat: location.lat,
    lon: location.lon,
  }
  const pickupState = useResolvedPlace(trip.from, null, null, here)
  const dropoffState = useResolvedPlace(trip.to, null, null)
  const pickup = pickupState.status === 'ready' ? pickupState.place : null
  const dropoff = dropoffState.status === 'ready' ? dropoffState.place : null
  const estimate = useRideEstimate(pickup, dropoff)

  const rescue = () => {
    markNextRideAsRescue()
    navigate(rescueRideUrl(trip))
  }

  const { train, delayMinutes, scheduledArrival, delayedArrival, savedMinutes } = RESCUE_SCENARIO

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--color-page-warm)' }}>
      <HomeHeader
        greeting="早安，小婷"
        location="新北市板橋區 24°C"
        /*
         * 右上的提示卡只有天氣圖示可選（太陽／雨），配在「誤點」旁邊很怪。
         * 誤點的訊息交給下面的橫幅講，這裡就不放卡。
         */
        alert={null}
      />

      <SituationBanner tone="warm" icon="⏱">
        {train} 目前誤點約 {delayMinutes} 分鐘，預計 {delayedArrival} 才會抵達公司。
      </SituationBanner>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <AssistantMessage card time={`${RESCUE_SCENARIO.lockscreenTime} AM`}>
          小婷，您今天搭的 {train} 誤點了 {delayMinutes} 分鐘，照這樣會比平常晚到公司。
          改搭 yoxi 叫車，預計可以早 {savedMinutes} 分鐘抵達。
          <TransportCard
            chip="⏱ 延誤救援"
            badge="省時救援"
            badgeIcon={<span aria-hidden="true">⚡</span>}
            title={`${trip.from} → ${trip.to}`}
            cta="查看救援方案"
            onCta={() => setOpen(true)}
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
              <span className="flex items-center gap-1 whitespace-nowrap">
                <ClockIcon />
                節省 {savedMinutes} 分鐘
              </span>
              <span className="whitespace-nowrap">車資於下一頁依實際距離估算</span>
            </div>
          </TransportCard>
        </AssistantMessage>
      </div>

      <ChatComposer />

      <Modal open={open} onClose={() => setOpen(false)} title="您的通勤路線有異常！">
        <p className="mt-1 text-center text-[15px] font-semibold text-primary">
          {train} 誤點 {delayMinutes} 分
        </p>

        {/* 時間對比：原本 → 誤點後。原本的時間劃掉，讓「晚了多少」一眼看得出來 */}
        <div className="mt-4 flex items-center justify-center gap-3 rounded-2xl bg-surface-2 px-4 py-3.5">
          <div className="text-center">
            <p className="text-[12px] text-subtle">原本抵達</p>
            <p className="mt-0.5 text-[22px] font-bold text-subtle line-through decoration-2">
              {scheduledArrival}
            </p>
          </div>
          <span aria-hidden="true" className="text-[20px] text-line">
            →
          </span>
          <span className="sr-only">改為</span>
          <div className="text-center">
            <p className="text-[12px] text-subtle">預計抵達</p>
            <p className="mt-0.5 text-[22px] font-bold text-primary">{delayedArrival}</p>
          </div>
        </div>

        {/* 推薦區塊，沿用對話裡交通建議卡的配色（主色淡底 + 主色框） */}
        <div className="mt-3 rounded-2xl border border-primary-muted bg-primary-tint px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[15px] font-bold">
              <span aria-hidden="true">🚕</span>
              yoxi 即時叫車
            </span>
            <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-white">
              推薦
            </span>
          </div>
          <p className="mt-1.5 text-[16px] font-bold text-primary">
            {estimate.status === 'ready' ? formatFare(estimate.data.fare) : '車資估算中…'}
            <span className="text-ink">・節省 {savedMinutes} 分鐘</span>
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {trip.from} → {trip.to}
          </p>
          {/*
            * 車資的來源一定要跟著數字一起出現（同估價頁）。
            * 估不出來就照實說、交給下一頁，不要退回設計稿的 NT$185。
            */}
          <p className="mt-1.5 text-[11px] text-subtle">
            {estimate.status === 'ready'
              ? estimate.data.basis
              : estimate.status === 'error' || pickupState.status === 'none' || dropoffState.status === 'none'
                ? '車資暫時估不出來，下一頁會再估一次'
                : '依臺北市公告計程車費率估算'}
          </p>
        </div>

        {/* 瀏覽器預設的藍色焦點框不在這套配色裡，改成只在鍵盤操作時出現的主色光圈（同 TabBar） */}
        <button
          type="button"
          onClick={rescue}
          className="mt-4 w-full rounded-xl bg-primary py-3.5 text-[16px] font-bold text-white outline-none transition-transform focus-visible:ring-4 focus-visible:ring-primary/30 active:scale-[.98]"
        >
          立即叫車救援
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-2 min-h-11 w-full rounded-xl py-3 text-[15px] font-semibold text-muted outline-none focus-visible:ring-4 focus-visible:ring-ink/15"
        >
          暫時不需要
        </button>
      </Modal>
    </div>
  )
}
