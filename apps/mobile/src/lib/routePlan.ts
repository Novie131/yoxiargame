import { useEffect, useState } from 'react'

import { API_URL } from './api'

/*
 * 捷運路徑規劃，資料來自後端的 /transit/plan。
 *
 * 這是「約 N 分鐘」的來源。設定畫面原本寫死 25 分鐘，我把它拿掉是因為
 * 沒有任何依據；現在後端用 TDX 的實際行駛時間算得出來，才把它放回去。
 *
 * 後端建一次路網圖快取一天，之後都是本地計算，所以這支查詢不吃 TDX 額度，
 * 前端也不需要特別節流。
 */

export type RouteLeg = {
  line: string
  lineId: string
  from: string
  to: string
  stops: number
  minutes: number
}

export type RoutePlan = {
  from: string
  to: string
  /** 含轉乘步行與估計的轉乘等車，不含等第一班車 */
  totalMinutes: number
  transfers: number
  legs: RouteLeg[]
}

export type PlanState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; plan: RoutePlan }
  /* 查不到就是查不到，畫面要留白而不是顯示一個估的數字 */
  | { status: 'unavailable' }

const cache = new Map<string, RoutePlan>()

export function useRoutePlan(from: string | null, to: string | null): PlanState {
  const key = from && to ? `${from}\u2192${to}` : null

  /*
   * 跟著「這批結果是哪一組起訖查來的」一起存。只存 plan 的話，
   * 使用者改了路線之後、新結果回來之前，畫面會拿舊路線的時間配新路線。
   */
  const [result, setResult] = useState<{ key: string; state: PlanState } | null>(null)

  useEffect(() => {
    if (!key || !from || !to) return

    /* 已經有結果就不用打，也不用 setState —— 下面直接在 render 期間讀快取 */
    if (cache.has(key)) return

    let alive = true
    fetch(`${API_URL}/transit/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as RoutePlan
      })
      .then((plan) => {
        cache.set(key, plan)
        if (alive) setResult({ key, state: { status: 'ready', plan } })
      })
      .catch(() => {
        /* 公車路線、或站名對不上捷運站表時會走到這裡，是預期內的 */
        if (alive) setResult({ key, state: { status: 'unavailable' } })
      })

    return () => {
      alive = false
    }
  }, [key, from, to])

  if (!key) return { status: 'idle' }

  /* 快取直接在 render 期間讀，不繞一圈 state —— 切回這頁時不會閃一下載入中 */
  const cached = cache.get(key)
  if (cached) return { status: 'ready', plan: cached }

  /* 還沒拿到這一組起訖的結果就是載入中，不要拿上一組的頂替 */
  return result?.key === key ? result.state : { status: 'loading' }
}
