import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { BottomSheet } from '@/components/BottomSheet'
import type { MapMarker } from '@/components/Map'
import { MapBackdrop } from '@/components/MapBackdrop'
import { Modal } from '@/components/Modal'
import { RouteLegend } from '@/components/RouteLegend'
import { AlertIcon, ShieldIcon } from '@/components/icons'
import { pointAlong } from '@/lib/drivingRoute'
import { completeRide, formatFare, useActiveRide, useRideProgress } from '@/lib/ride'
import { useRideMapRoute } from '@/lib/rideMap'

/*
 * 對應設計稿 frame：yoxi-trip-in-progress（叫車 ④／行程進行中）
 *
 * 目的地、剩餘時間、費用都來自實際叫的那一趟，不再是設計稿的
 * 「臺北101 / 12 分鐘 / NT$285」。
 *
 * 剩餘時間是**模擬**的（見 lib/ride 的 DEMO_SPEEDUP），費用是依公告費率
 * 估算的區間 —— 兩件事畫面上都要講。真正的跳表金額只有車上的計費器知道。
 *
 * 安全分享用系統分享表（Web Share）把車牌、司機、目的地傳給親友，不支援的瀏覽器改成複製；
 * 內容是這趟車的真實資料，只是沒有即時追蹤連結（那要派車系統）。
 * 緊急求助直接撥 110／119 —— 這兩個號碼不需要接任何系統，demo 也該是真的。
 */

export function TripInProgressScreen() {
  const navigate = useNavigate()
  const ride = useActiveRide()
  const progress = useRideProgress(ride)

  /*
   * 地圖：上車點 → 目的地的路線，加上「目前位置」（設計稿 yoxi-trip-in-progress）。
   *
   * 目前位置是**模擬**的：照倒數的進度沿著路線往前推（lib/ride 的 DEMO_SPEEDUP），
   * 跟下方「剩餘時間為示範速度」是同一件事。點落在路線上而不是兩點連線上，
   * 才不會在 demo 時看到一台車在河上飄。
   *
   * hooks 要放在下面的 early return 之前，所以沒有行程時兩端給 null。
   */
  const pickupLat = ride?.pickup.lat
  const pickupLon = ride?.pickup.lon
  const dropLat = ride?.dropoff.lat
  const dropLon = ride?.dropoff.lon
  const dropLabel = ride?.dropoff.label
  const from = useMemo(
    () =>
      pickupLat !== undefined && pickupLon !== undefined ? { lng: pickupLon, lat: pickupLat } : null,
    [pickupLat, pickupLon],
  )
  const to = useMemo(
    () => (dropLat !== undefined && dropLon !== undefined ? { lng: dropLon, lat: dropLat } : null),
    [dropLat, dropLon],
  )
  const map = useRideMapRoute(from, to)

  const duration = ride?.estimate.durationMinutes ?? 0
  const traveled =
    !progress || progress.phase === 'arriving'
      ? 0
      : progress.phase === 'finished' || duration <= 0
        ? 1
        : 1 - progress.tripMinutes / duration
  const line = map.route?.coordinates ?? (from && to ? [from, to] : [])
  const here = pointAlong(line, traveled)
  const hereLng = here?.lng
  const hereLat = here?.lat

  const markers = useMemo<MapMarker[]>(
    () => [
      ...(to ? [{ id: 'dropoff', position: to, label: dropLabel, variant: 'goal' as const }] : []),
      /* 目前位置最後加，疊在路線與目的地上面 */
      ...(hereLng !== undefined && hereLat !== undefined
        ? [{ id: 'here', position: { lng: hereLng, lat: hereLat }, variant: 'dot' as const }]
        : []),
    ],
    [to, dropLabel, hereLng, hereLat],
  )

  /*
   * 按「完成行程」時 completeRide 會同步清掉行程，但換頁是包在 transition 裡的、比較晚。
   * 沒有這個旗標，下面的保護會先看到「沒有行程」把人導回叫車首頁，結算頁就被蓋掉了。
   */
  const leaving = useRef(false)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const [sos, setSos] = useState(false)

  useEffect(() => {
    if (!ride && !leaving.current) navigate('/ride/booking', { replace: true })
  }, [ride, navigate])

  if (!ride || !progress) return null

  const arrived = progress.phase === 'finished'

  const share = async () => {
    const { driver } = ride
    const text = [
      `我正在搭乘 yoxi 前往 ${ride.dropoff.label}`,
      `車牌 ${driver.plate}・${driver.car}・${driver.name}司機`,
      arrived ? '已抵達目的地' : `預計 ${progress.tripMinutes} 分鐘後抵達`,
    ].join('\n')
    try {
      if (navigator.share) {
        await navigator.share({ title: 'yoxi 行程分享', text })
        setShareNote('已開啟分享')
      } else {
        await navigator.clipboard.writeText(text)
        setShareNote('行程資訊已複製，可以貼給親友')
      }
    } catch (e) {
      /* 使用者自己關掉分享表不算錯誤 */
      if (e instanceof DOMException && e.name === 'AbortError') return
      setShareNote('無法分享，請截圖傳給親友')
    }
  }

  const finish = () => {
    leaving.current = true
    completeRide()
    navigate('/ride/settlement')
  }

  return (
    <div className="flex h-full flex-col">
      <MapBackdrop
        center={ride.dropoff}
        markers={markers}
        route={map.route}
        fitBounds={map.fitBounds}
        /* 人在車上，位置以路線上的模擬點為準；真實定位的藍點會跟它打架 */
        showUserLocation={false}
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

        <RouteLegend driving={map.driving} />
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

        {/*
          * 窄螢幕不再對半分：「12 分鐘」用不到半格，車資卻可能是「NT$1230-1555」
          * 這種四位數的範圍。讓左格照內容寬、右格吃剩下的，車資就不用縮到看不清楚。
          */}
        <div className="mt-3 grid grid-cols-2 gap-2.5 border-t border-black/[.06] pt-3 max-[359px]:grid-cols-[auto_1fr]">
          <div className="rounded-xl bg-primary-tint px-3.5 py-3">
            <p className="text-[12px] text-subtle">{arrived ? '行程狀態' : '預計抵達'}</p>
            <p className="mt-0.5 text-[20px] font-bold">
              {arrived ? '已抵達' : `${progress.tripMinutes} 分鐘`}
            </p>
          </div>
          <div className="rounded-xl bg-primary-tint px-3.5 py-3">
            <p className="text-[12px] text-subtle">預估費用</p>
            {/*
              * 車資是一個值，不能從「-」斷開。窄螢幕除了上面讓格子變寬，
              * 再降一級字，四位數的範圍才放得下。
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
            onClick={() => void share()}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-primary py-3.5 text-[15px] font-semibold text-primary"
          >
            <ShieldIcon />
            安全分享
          </button>
          <button
            type="button"
            onClick={() => setSos(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-primary py-3.5 text-[15px] font-semibold text-primary"
          >
            <AlertIcon />
            緊急求助
          </button>
        </div>
        {shareNote && (
          <p role="status" className="mt-2 text-center text-[12px] text-muted">
            {shareNote}
          </p>
        )}

        <button
          type="button"
          onClick={finish}
          className="mt-3 w-full rounded-xl bg-primary py-3.5 text-[16px] font-bold text-white transition-transform active:scale-[.98]"
        >
          {arrived ? '完成行程' : '結束行程'}
        </button>
      </BottomSheet>

      <Modal open={sos} onClose={() => setSos(false)} title="需要緊急協助？" icon={<AlertIcon />}>
        <p className="mt-3 text-center text-[14px] leading-[1.6] text-muted">
          車牌 {ride.driver.plate}・前往 {ride.dropoff.label}
          <br />
          撥號前可先記下車牌，告訴對方你的位置。
        </p>
        <a
          href="tel:110"
          className="mt-4 block w-full rounded-xl bg-primary py-3.5 text-center text-[16px] font-bold text-white"
        >
          撥打 110 報案
        </a>
        <a
          href="tel:119"
          className="mt-2.5 block w-full rounded-xl border border-primary py-3.5 text-center text-[16px] font-bold text-primary"
        >
          撥打 119 救護
        </a>
        <button
          type="button"
          onClick={() => setSos(false)}
          className="mt-2.5 w-full py-3 text-[15px] text-muted"
        >
          我沒事，取消
        </button>
      </Modal>
    </div>
  )
}
