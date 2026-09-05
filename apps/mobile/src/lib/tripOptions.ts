import { useEffect, useState } from 'react'

import { API_URL } from './api'

/*
 * 「怎麼去」的選項，資料來自後端的 /trip/options。
 *
 * 選項已經由後端依實際時間排好序。畫面**不要**再重排、也不要把叫車拉到前面 ——
 * 那個排序就是這個功能的重點：讓使用者看到誠實的比較再自己選。
 */

export type WalkOption = { mode: 'walk'; minutes: number; distanceMeters: number }

export type MetroOption = {
  mode: 'metro'
  totalMinutes: number
  fromStation: { name: string; walkMinutes: number }
  toStation: { name: string; walkMinutes: number }
  plan: {
    totalMinutes: number
    transfers: number
    legs: Array<{ line: string; from: string; to: string; stops: number; minutes: number }>
  }
}

/** 刻意沒有時間與車資：目前沒有接任何叫車估價來源 */
export type RideOption = { mode: 'ride'; distanceMeters: number }

export type TripOption = WalkOption | MetroOption | RideOption

export type TripOptions = {
  distanceMeters: number
  arrived: boolean
  options: TripOption[]
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
