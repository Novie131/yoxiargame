import type {
  MetroOption,
  RideOption,
  TripAdvice,
  TripOption,
  TripOptions,
  WalkOption,
} from '@api/services/trip-options.ts'
import { useEffect, useState } from 'react'

import { api, coordsQuery } from './client'
import { formatFare } from './ride'

/*
 * 「怎麼去」的選項，資料來自後端的 /trip/options。
 *
 * 選項已經由後端依實際時間排好序。畫面**不要**再重排、也不要把叫車拉到前面 ——
 * 那個排序就是這個功能的重點：讓使用者看到誠實的比較再自己選。
 *
 * 叫車現在也有時間與車資了（依公告費率估算），所以它會跟其他選項一起排序，
 * 短程時排到第一是正常的 —— 不推叫車的意思是不插隊，不是一律墊底。
 */

/*
 * 選項的形狀直接用後端的（services/trip-options.ts）。
 * 叫車的 estimate.basis 與 advice.reason 一定要顯示，理由在那邊的註解。
 */
export type { MetroOption, RideOption, TripAdvice, TripOption, TripOptions, WalkOption }

/** 捷運票價。後端查不到時整個是 null，畫面就不顯示票價。 */
export type MetroFare = NonNullable<MetroOption['fare']>

export type TripOptionsState =
  | { status: 'loading' }
  | { status: 'ready'; data: TripOptions }
  | { status: 'error' }

const cache = new Map<string, TripOptions>()

export function useTripOptions(
  from: { lat: number; lon: number } | null,
  to: { lat: number; lon: number } | null,
): TripOptionsState {
  /* 座標取到小數第四位（約 10 公尺）當快取鍵，手指微動不會重打 */
  const key =
    from && to
      ? `${from.lat.toFixed(4)},${from.lon.toFixed(4)}→${to.lat.toFixed(4)},${to.lon.toFixed(4)}`
      : null

  const [result, setResult] = useState<{ key: string; state: TripOptionsState } | null>(null)

  useEffect(() => {
    if (!key || !from || !to || cache.has(key)) return

    let alive = true
    api.trip.options
      .$get({ query: coordsQuery(from, to) })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.json()
      })
      .then((data) => {
        cache.set(key, data)
        if (alive) setResult({ key, state: { status: 'ready', data } })
      })
      .catch(() => {
        if (alive) setResult({ key, state: { status: 'error' } })
      })

    return () => {
      alive = false
    }
  }, [key, from, to])

  if (!key) return { status: 'loading' }

  const cached = cache.get(key)
  if (cached) return { status: 'ready', data: cached }

  return result?.key === key ? result.state : { status: 'loading' }
}

/** 一個選項 → 畫面上的兩行字。探索頁的任務面板與對話裡的店家卡共用。 */
export function describeTripOption(o: TripOption): { title: string; detail: string } {
  if (o.mode === 'walk') {
    return {
      title: `步行 ${o.minutes} 分鐘`,
      detail: `約 ${o.distanceMeters >= 1000 ? `${(o.distanceMeters / 1000).toFixed(1)} 公里` : `${o.distanceMeters} 公尺`}`,
    }
  }
  if (o.mode === 'metro') {
    const legs = o.plan.legs.map((l) => l.line).join(' → ')
    /*
     * 票價放進標題而不是細節：時間與錢是同一個決定的兩半，
     * 把錢藏在第二行等於還是只給了半句話。查不到就整段不顯示。
     */
    return {
      title: `搭捷運 約 ${o.totalMinutes} 分鐘${o.fare ? `・NT$${o.fare.singleJourney}` : ''}`,
      detail:
        `走 ${o.fromStation.walkMinutes} 分到${o.fromStation.name}・${legs}` +
        `${o.plan.transfers > 0 ? `・轉乘 ${o.plan.transfers} 次` : ''}` +
        `・出站走 ${o.toStation.walkMinutes} 分` +
        /* basis 要跟數字一起出現，不然使用者會以為這就是他會付的錢 */
        (o.fare ? `・${o.fare.basis}` : ''),
    }
  }
  /*
   * 車資是依公告費率估算的，不是 yoxi 報價 —— detail 要把這件事講出來，
   * 不然使用者會以為這是已經談好的價錢。
   */
  return {
    title: `叫車 約 ${o.estimate.durationMinutes} 分鐘`,
    detail: `${formatFare(o.estimate.fare)}・${o.estimate.distanceKm} 公里・依公告費率估算`,
  }
}
