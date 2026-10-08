import type { DepartureConfidence, DeparturePlan } from '@api/services/departure.ts'
import { useEffect, useState } from 'react'

import { api } from './client'
import type { RouteLabel } from './commute'

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

/*
 * 倒數的形狀直接用後端的（services/departure.ts 的 DeparturePlan），
 * 各欄位的意思與畫面該怎麼顯示，註解都在那裡。
 */
export type Departure = DeparturePlan
export type { DepartureConfidence }

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
    api.commute.departure
      .$get({ query: { label } })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.json()
      })
      .then((body) => {
        const departure = body.departure
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
