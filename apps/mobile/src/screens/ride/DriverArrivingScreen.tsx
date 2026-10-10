import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router'

import { BottomSheet } from '@/components/BottomSheet'
import type { MapMarker } from '@/components/Map'
import { MapBackdrop } from '@/components/MapBackdrop'
import {
  ChatIcon,
  CrosshairIcon,
  MemberIcon,
  PhoneIcon,
  StarIcon,
  TaxiIcon,
} from '@/components/icons'
import { requestLocation } from '@/lib/location'
import { endRide, useActiveRide, useRideProgress } from '@/lib/ride'
import { driverStartOf, useRideMapRoute } from '@/lib/rideMap'

/*
 * 對應設計稿 frame：yoxi-driver-arriving（叫車 ③／司機前往中）
 *
 * 上車點、目的地來自實際叫的那一趟（lib/ride）。
 * **司機、車輛、倒數是模擬的** —— 沒有接派車系統，所以畫面上直接標示出來。
 * 不標示的話這一頁看起來跟接上真實派車之後一模一樣，demo 會被誤讀成實裝。
 *
 * 倒數跑完會自己進入行程中，那是設計稿的原意；狀態列照樣可以點，
 * 讓 demo 不用等。
 */

export function DriverArrivingScreen() {
  const navigate = useNavigate()
  const ride = useActiveRide()
  const progress = useRideProgress(ride)

  /*
   * 地圖：司機 → 上車點的路線（設計稿 yoxi-driver-arriving）。
   * 司機的出發位置是模擬的（lib/rideMap），跟司機卡片一樣屬於「模擬派車」。
   *
   * hooks 要放在下面的 early return 之前，所以沒有行程時兩端給 null。
   */
  const pickupLat = ride?.pickup.lat
  const pickupLon = ride?.pickup.lon
  const pickupLabel = ride?.pickup.label
  const plate = ride?.driver.plate
  const pickupAt = useMemo(
    () =>
      pickupLat !== undefined && pickupLon !== undefined ? { lng: pickupLon, lat: pickupLat } : null,
    [pickupLat, pickupLon],
  )
  const driverFrom = useMemo(() => (pickupAt ? driverStartOf(pickupAt) : null), [pickupAt])
  const map = useRideMapRoute(driverFrom, pickupAt, { joinStart: false })
  /* 車放在路線的第一個點 —— OSRM 會把出發點吸到道路上，車才不會停在路外 */
  const carAt = map.driving?.coordinates[0] ?? driverFrom
  const markers = useMemo<MapMarker[]>(
    () => [
      ...(pickupAt ? [{ id: 'pickup', position: pickupAt, label: pickupLabel, variant: 'origin' as const }] : []),
      ...(carAt ? [{ id: 'driver', position: carAt, label: plate, variant: 'car' as const }] : []),
    ],
    [pickupAt, pickupLabel, carAt, plate],
  )

  /* 沒有進行中的行程（重新整理、直接開這個網址）就回去叫車 */
  useEffect(() => {
    if (!ride) navigate('/ride/booking', { replace: true })
  }, [ride, navigate])

  /* 司機到了就自動進行程中 —— 設計稿就是這樣，不用使用者按 */
  useEffect(() => {
    if (progress && progress.phase !== 'arriving') {
      navigate('/ride/trip', { replace: true })
    }
  }, [progress, navigate])

  if (!ride || !progress) return null

  const { driver } = ride

  const cancel = () => {
    endRide()
    navigate('/ride/booking', { replace: true })
  }

  return (
    <div className="flex h-full flex-col">
      <MapBackdrop
        center={ride.pickup}
        markers={markers}
        route={map.route}
        fitBounds={map.fitBounds}
        showUserLocation={false}
      >
        {/* 點這條可以不等倒數直接往下走 */}
        <button
          type="button"
          onClick={() => navigate('/ride/trip')}
          className="absolute inset-x-4 top-3 flex items-center justify-center gap-2 rounded-full border border-primary bg-surface px-4 py-3 shadow-[0_3px_14px_rgba(22,32,55,.14)]"
        >
          <TaxiIcon />
          <span className="text-[15px] font-semibold text-primary">
            司機前往中・預計 {progress.driverMinutes} 分鐘後抵達
          </span>
        </button>

        <button
          type="button"
          aria-label="重新定位"
          onClick={() => void requestLocation()}
          className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface shadow-[0_3px_14px_rgba(22,32,55,.18)]"
        >
          <CrosshairIcon />
        </button>
      </MapBackdrop>

      <BottomSheet>
        <div className="flex items-start gap-3">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-success" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-subtle">上車地點</p>
            <p className="truncate text-[15px] font-semibold">{ride.pickup.label}</p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-subtle">前往</p>
            <p className="truncate text-[15px] font-semibold">{ride.dropoff.label}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3.5 rounded-2xl bg-surface-2 p-3.5">
          {/* 設計稿是司機大頭照。接上派車後由 API 帶回，這裡是佔位圖示 */}
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-4">
            <MemberIcon />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[17px] font-bold">
              {driver.name} 司機
              <StarIcon active />
              <span className="text-[14px]">{driver.rating}</span>
            </p>
            <p className="mt-0.5 text-[13px] text-muted">{driver.car}</p>
            <span className="mt-1.5 inline-block rounded-md bg-primary-tint px-2 py-1 text-[13px] font-bold text-primary">
              {driver.plate}
            </span>
          </div>
        </div>

        {/*
          * 把真相放進畫面。這頁的司機卡片做得跟設計稿一樣完整，
          * 所以更需要這一行 —— 沒有它，沒人分得出派車有沒有接上。
          */}
        <p className="mt-2 text-center text-[11px] text-subtle">
          模擬派車・倒數為示範速度，尚未接上 yoxi 派車系統
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled
            className="flex items-center justify-center gap-2 rounded-xl border border-line/60 py-3.5 text-[15px] font-medium disabled:opacity-45"
          >
            <ChatIcon />
            傳送訊息
          </button>
          <button
            type="button"
            disabled
            className="flex items-center justify-center gap-2 rounded-xl border border-line/60 py-3.5 text-[15px] font-medium disabled:opacity-45"
          >
            <PhoneIcon />
            撥打電話
          </button>
        </div>

        <div className="mt-3 border-t border-black/[.06] pt-3 text-center">
          <button
            type="button"
            onClick={cancel}
            className="text-[15px] text-muted underline underline-offset-4"
          >
            取消行程
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
