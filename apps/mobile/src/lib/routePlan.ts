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

/** 捷運此刻的營運狀態。形狀跟後端的 ServiceState 一致。 */
export type MetroService =
  | { status: 'running' | 'unknown' }
  | { status: 'closed'; station: string; line: string; firstTrain: string; lastTrain: string }

export type RoutePlan = {
  from: string
  to: string
  /** 車程 + 轉乘步行 + 依真實班距估算的等車 */
  totalMinutes: number
  /** 只有車程與轉乘站內步行 */
  rideMinutes: number
  /** 等車的期望值。班距拿不到時為 0。 */
  waitMinutes: number
  transfers: number
  legs: RouteLeg[]
  /** 現在是不是尖峰 */
  peak: boolean
  service: MetroService
}

export type PlanState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; plan: RoutePlan }
  /* 查不到就是查不到，畫面要留白而不是顯示一個估的數字 */
  | { status: 'unavailable' }

/*
 * 快取要有存活時間。
 *
 * 這份結果現在跟時間有關（等車、尖峰、還有沒有車），沒有 TTL 的話，
 * 半夜開著 App 的人會一直看到白天查到的「營運中」—— 而那是最不能講錯的一種。
 * 兩分鐘跟後端的 Cache-Control 對齊。
 */
const CACHE_TTL_MS = 2 * 60 * 1000

const cache = new Map<string, { at: number; plan: RoutePlan }>()

function fresh(key: string): RoutePlan | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at >= CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return hit.plan
}

export function useRoutePlan(from: string | null, to: string | null): PlanState {
  const key = from && to ? `${from}\u2192${to}` : null

  /*
   * 跟著「這批結果是哪一組起訖查來的」一起存。只存 plan 的話，
   * 使用者改了路線之後、新結果回來之前，畫面會拿舊路線的時間配新路線。
   */
  const [result, setResult] = useState<{ key: string; state: PlanState } | null>(null)

  useEffect(() => {
    if (!key || !from || !to) return

    /* 已經有還新鮮的結果就不用打，也不用 setState —— 下面直接在 render 期間讀快取 */
    if (fresh(key)) return

    let alive = true
    fetch(`${API_URL}/transit/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as RoutePlan
      })
      .then((plan) => {
        cache.set(key, { at: Date.now(), plan })
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
  const cached = fresh(key)
  if (cached) return { status: 'ready', plan: cached }

  /* 還沒拿到這一組起訖的結果就是載入中，不要拿上一組的頂替 */
  return result?.key === key ? result.state : { status: 'loading' }
}
