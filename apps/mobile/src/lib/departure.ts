import { useEffect, useState } from 'react'

import { API_URL } from './api'
import type { RouteLabel } from './commute'
import type { RideEstimate } from './ride'
import { userHeaders } from './userRef'

/*
 * 出發倒數，資料來自後端的 /commute/departure。
 *
 * 設計稿的行程卡寫「建議 08:05 出發」，但那需要知道使用者幾點要到。
 * 通勤設定補上「幾點要到公司」之後，這句話才有依據。
 *
 * ── 沒有設定抵達時間就是 null ──
 * 這時候畫面要退回原本的「現在出發約 N 分鐘」，**不要**猜一個上班時間。
 * 猜錯的代價是使用者錯過會議，而他會以為那是我們算好的。
 */

export type DepartureConfidence = 'normal' | 'low'

export type Departure = {
  /** 使用者設定的抵達時間，HH:MM */
  arriveBy: string
  /** 建議幾點出門，HH:MM。已經含出門緩衝。 */
  departBy: string
  /** 距離建議出發還有幾分鐘。負數代表已經該出門了。 */
  minutesUntilDeparture: number
  /** 門到門：車程 + 轉乘 + 期望等車 + 出門緩衝 */
  totalMinutes: number
  /** 其中的期望等車。班距的一半，是期望值不是保證。 */
  waitMinutes: number
  /** 其中的出門緩衝。單獨列出來，不要藏進總時間裡。 */
  bufferMinutes: number
  /** low 時畫面要明顯地降級顯示，不要照常倒數 */
  confidence: DepartureConfidence
  /** confidence 為 low 時說明少了哪一份資料 */
  caveat: string | null
  /** 這個倒數怎麼算的。要原封不動顯示，理由跟 ride.ts 的 basis 一樣。 */
  basis: string
  /** 來不及時的叫車估價。還來得及時是 null。 */
  rideFallback: RideEstimate | null
}

export type DepartureState =
  | { status: 'loading' }
  /** departure 為 null = 沒設定抵達時間，或這條路線算不出倒數 */
  | { status: 'ready'; departure: Departure | null }
  | { status: 'unavailable' }

/*
 * 倒數每分鐘都會變，所以快取很短。
 *
 * 但也不能完全不快取：使用者在分頁之間切換時不該每次都重打。
 * 30 秒是「顯示的分鐘數最多晚半分鐘」與「不要一直打後端」之間的折衷。
 */
const CACHE_TTL_MS = 30 * 1000

const cache = new Map<string, { at: number; departure: Departure | null }>()

function fresh(label: RouteLabel): { departure: Departure | null } | null {
  const hit = cache.get(label)
  if (!hit) return null
  if (Date.now() - hit.at >= CACHE_TTL_MS) {
    cache.delete(label)
    return null
  }
  return hit
}

export function useDeparture(label: RouteLabel | null): DepartureState {
  const [result, setResult] = useState<{ label: RouteLabel; state: DepartureState } | null>(null)

  /*
   * 每分鐘重新整理一次。
   *
   * 沒有這個的話，使用者停在行程頁上，倒數會停在打開頁面的那一刻 ——
   * 一個不會動的倒數比沒有倒數更糟，因為它看起來還在運作。
   */
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!label) return
    if (fresh(label)) return

    let alive = true
    fetch(`${API_URL}/commute/departure?label=${label}`, { headers: userHeaders() })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as { departure?: Departure | null }
      })
      .then((body) => {
        const departure = body.departure ?? null
        cache.set(label, { at: Date.now(), departure })
        if (alive) setResult({ label, state: { status: 'ready', departure } })
      })
      .catch(() => {
        /* 還沒設定路線（404）也會走到這裡，是預期內的 */
        if (alive) setResult({ label, state: { status: 'unavailable' } })
      })

    return () => {
      alive = false
    }
  }, [label, tick])

  if (!label) return { status: 'ready', departure: null }

  const cached = fresh(label)
  if (cached) return { status: 'ready', departure: cached.departure }

  return result?.label === label ? result.state : { status: 'loading' }
}
