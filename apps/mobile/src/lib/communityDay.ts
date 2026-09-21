import { useEffect, useState } from 'react'

import { API_URL } from './api'
import type { RideEstimate } from './ride'
import { userHeaders } from './userRef'

/*
 * 社群日的行程，資料來自後端的 /campaigns/today。
 *
 * ── 大部分時候這裡就是 null ──
 * 一年裡沒有社群日的日子遠多於有的。所以「沒有活動」是常態不是錯誤，
 * 畫面要能安靜地不顯示任何東西，不要放一張「目前沒有活動」的空卡片
 * 佔著探索頁最顯眼的位置。
 *
 * ── participantsToday 是熱度，不是可共乘的人數 ──
 * 它是「今天有多少人完成過這場活動的任務」的聚合數字。我們沒有登入、
 * 沒有即時位置，做不了共乘媒合。畫面上不要寫成「附近有 N 人可共乘」。
 */

export type ItineraryLeg = {
  order: number
  mission: {
    id: string
    name: string
    lat: number
    lon: number
    radiusMeters: number
    tags: string[]
    completed: boolean
  }
  distanceMeters: number
  /** 建議用走的還是叫車 */
  mode: 'walk' | 'ride'
  walkMinutes: number
  /** mode 為 ride 時才有。依公告費率估算，basis 要一起顯示。 */
  ride: RideEstimate | null
}

export type Itinerary = {
  campaignId: string
  name: string
  endsAt: string | null
  /** 今天完成過這場活動任務的人數。是熱度，不是可共乘的人。 */
  participantsToday: number
  remaining: number
  completed: number
  legs: ItineraryLeg[]
  totalWalkMinutes: number
  /** 這條行程怎麼算出來的。要原封不動顯示。 */
  basis: string
}

export type CommunityDayState =
  | { status: 'loading' }
  /** day 為 null = 現在這附近沒有進行中的活動，這是常態 */
  | { status: 'ready'; day: Itinerary | null }
  | { status: 'error' }

/*
 * 活動會隨著打卡而變（剩幾個點、順序、參與人數），所以不做長快取。
 * 但也不能每次 render 都打 —— 座標取到小數第三位（約 100 公尺）當相依。
 */
export function useCommunityDay(
  origin: { lat: number; lon: number } | null,
  /** 打卡之後把這個值 +1 就會重查 */
  refreshKey = 0,
): CommunityDayState {
  const [state, setState] = useState<CommunityDayState>({ status: 'loading' })

  const key = origin ? `${origin.lat.toFixed(3)},${origin.lon.toFixed(3)}` : null

  useEffect(() => {
    if (!key) return

    let alive = true
    const [lat, lon] = key.split(',')

    fetch(`${API_URL}/campaigns/today?lat=${lat}&lon=${lon}`, { headers: userHeaders() })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as { day?: Itinerary | null }
      })
      .then((body) => {
        if (alive) setState({ status: 'ready', day: body.day ?? null })
      })
      .catch(() => {
        /* 活動是輔助內容，拿不到就不顯示，不要擋住探索頁 */
        if (alive) setState({ status: 'error' })
      })

    return () => {
      alive = false
    }
  }, [key, refreshKey])

  if (!key) return { status: 'ready', day: null }
  return state
}

/** 活動還剩多久（分鐘）。已結束或沒有結束時間時回 null。 */
export function minutesLeft(endsAt: string | null): number | null {
  if (!endsAt) return null
  const diff = new Date(endsAt).getTime() - Date.now()
  return diff > 0 ? Math.round(diff / 60_000) : null
}
