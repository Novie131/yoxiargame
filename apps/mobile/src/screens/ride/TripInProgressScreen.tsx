import { useEffect } from 'react'
import { useNavigate } from 'react-router'

import { BottomSheet } from '@/components/BottomSheet'
import { MapBackdrop } from '@/components/MapBackdrop'
import { AlertIcon, ShieldIcon } from '@/components/icons'
import { endRide, formatFare, useActiveRide, useRideProgress } from '@/lib/ride'

/*
 * 對應設計稿 frame：yoxi-trip-in-progress（叫車 ④／行程進行中）
 *
 * 目的地、剩餘時間、費用都來自實際叫的那一趟，不再是設計稿的
 * 「臺北101 / 12 分鐘 / NT$285」。
 *
 * 剩餘時間是**模擬**的（見 lib/ride 的 DEMO_SPEEDUP），費用是依公告費率
 * 估算的區間 —— 兩件事畫面上都要講。真正的跳表金額只有車上的計費器知道。
 */

export function TripInProgressScreen() {
  const navigate = useNavigate()
  const ride = useActiveRide()
  const progress = useRideProgress(ride)

  useEffect(() => {
    if (!ride) navigate('/ride/booking', { replace: true })
  }, [ride, navigate])

  if (!ride || !progress) return null

  const arrived = progress.phase === 'finished'

  const finish = () => {
    endRide()
    navigate('/')
  }

  return (
    <div className="flex h-full flex-col">
      <MapBackdrop
        center={ride.dropoff}
        markers={[
          {
            id: 'dropoff',
            position: { lng: ride.dropoff.lon, lat: ride.dropoff.lat },
            label: ride.dropoff.label,
          },
        ]}
      >
        <div className="absolute inset-x-4 top-3 flex items-center justify-between rounded-full bg-surface px-4 py-3 shadow-[0_3px_14px_rgba(22,32,55,.14)]">
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            {arrived ? '已抵達' : '行程進行中'}
          </span>
          <span className="text-[15px] font-bold text-primary">
            {arrived ? '感謝搭乘' : '安全行駛中'}
          </span>
        </div>
      </MapBackdrop>

      <BottomSheet>
        <div>
          <p className="text-[12px] text-subtle">目的地</p>
          <p className="mt-0.5 flex items-center gap-2 text-[20px] font-bold">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
            <span className="min-w-0 truncate">{ride.dropoff.label}</span>
          </p>
          <p className="mt-0.5 pl-[18px] text-[13px] text-subtle">
            從 {ride.pickup.label} 出發・{ride.carType}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5 border-t border-black/[.06] pt-3">
          <div className="rounded-xl bg-primary-tint px-3.5 py-3">
            <p className="text-[12px] text-subtle">{arrived ? '行程狀態' : '預計抵達'}</p>
            <p className="mt-0.5 text-[20px] font-bold">
              {arrived ? '已抵達' : `${progress.tripMinutes} 分鐘`}
            </p>
          </div>
          <div className="rounded-xl bg-primary-tint px-3.5 py-3">
            <p className="text-[12px] text-subtle">預估費用</p>
            {/*
              * 車資是一個值，不能從「-」斷開。半寬的格子在 320 寬只剩約 110px，
              * 20px 的「NT$230-255」放不下，所以窄螢幕降一級字。
              */}
            <p className="mt-0.5 whitespace-nowrap text-[20px] font-bold text-primary max-[359px]:text-[17px]">
              {formatFare(ride.estimate.fare)}
            </p>
          </div>
        </div>

        {/*
          * 費用是估算不是跳表金額，倒數是模擬的。兩件事分開講，
          * 因為它們之後會在不同時間被換掉（估價接 yoxi、倒數接派車推播）。
          */}
        <p className="mt-2 text-center text-[11px] text-subtle">
          {ride.estimate.basis}・剩餘時間為示範速度
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled
            className="flex items-center justify-center gap-1.5 rounded-xl border border-primary py-3.5 text-[15px] font-semibold text-primary disabled:opacity-45"
          >
            <ShieldIcon />
            安全分享
          </button>
          <button
            type="button"
            disabled
            className="flex items-center justify-center gap-1.5 rounded-xl border border-primary py-3.5 text-[15px] font-semibold text-primary disabled:opacity-45"
          >
            <AlertIcon />
            緊急求助
          </button>
        </div>

        <button
          type="button"
          onClick={finish}
          className="mt-3 w-full rounded-xl bg-primary py-3.5 text-[16px] font-bold text-white transition-transform active:scale-[.98]"
        >
          {arrived ? '完成行程' : '結束行程'}
        </button>
      </BottomSheet>
    </div>
  )
}
