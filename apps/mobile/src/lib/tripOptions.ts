import { useEffect, useState } from 'react'

import { API_URL } from './api'
import type { RideEstimate } from './ride'

/*
 * 「怎麼去」的選項，資料來自後端的 /trip/options。
 *
 * 選項已經由後端依實際時間排好序。畫面**不要**再重排、也不要把叫車拉到前面 ——
 * 那個排序就是這個功能的重點：讓使用者看到誠實的比較再自己選。
 *
 * 叫車現在也有時間與車資了（依公告費率估算），所以它會跟其他選項一起排序，
 * 短程時排到第一是正常的 —— 不推叫車的意思是不插隊，不是一律墊底。
 */

export type WalkOption = { mode: 'walk'; minutes: number; distanceMeters: number }

/** 捷運票價。後端查不到時整個是 null，畫面就不顯示票價。 */
export type MetroFare = {
  /** 單程票全票（元） */
  singleJourney: number
  /** 這是哪一種票。要跟數字一起顯示，理由同 ride 的 basis。 */
  basis: string
}

export type MetroOption = {
  mode: 'metro'
  totalMinutes: number
  fromStation: { name: string; walkMinutes: number }
  toStation: { name: string; walkMinutes: number }
  /*
   * 公告票價。沒有它的話，這個面板講的是「捷運少花 8 分鐘」這種半句話 ——
   * 省 8 分鐘要多付 40 元跟要多付 225 元是完全不同的決定。
   */
  fare: MetroFare | null
  plan: {
    totalMinutes: number
    transfers: number
    legs: Array<{ line: string; from: string; to: string; stops: number; minutes: number }>
  }
}

/** 車資與車程是估算值，basis 說明來源 —— 顯示數字時必須一起顯示它 */
export type RideOption = { mode: 'ride'; distanceMeters: number; estimate: RideEstimate }

export type TripOption = WalkOption | MetroOption | RideOption

/*
 * 一句「值不值得」的建議，由後端算。
 *
 * **它不影響排序** —— options 的順序永遠照實際時間。畫面把建議放在清單上方
 * 當一句話顯示，不要拿它去把某個選項往前挪，那等於把推銷藏進一個
 * 看起來中立的清單裡。
 */
export type TripAdvice = {
  /** ride = 值得叫車；transit = 不值得，走路或捷運就好 */
  verdict: 'ride' | 'transit'
  headline: string
  /** 憑什麼這樣講。一定要顯示，使用者得能自己判斷理由成不成立。 */
  reason: string
}

export type TripOptions = {
  distanceMeters: number
  arrived: boolean
  options: TripOption[]
  /** 沒有明確答案時是 null，那是常態 —— 不要每次都硬擠一句 */
  advice: TripAdvice | null
}

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
    const url =
      `${API_URL}/trip/options?fromLat=${from.lat}&fromLon=${from.lon}` +
      `&toLat=${to.lat}&toLon=${to.lon}`

    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as TripOptions
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
