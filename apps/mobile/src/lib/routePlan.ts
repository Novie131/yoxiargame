import type { LegTiming, ServiceState } from '@api/services/metro-schedule.ts'
import type { MetroFare, StationAccessibility } from '@api/services/tdx.ts'
import type { InferResponseType } from 'hono/client'
import { useEffect, useState } from 'react'

import { api } from './client'

/*
 * 捷運路徑規劃，資料來自後端的 /transit/plan。
 *
 * 這是「約 N 分鐘」的來源。設定畫面原本寫死 25 分鐘，我把它拿掉是因為
 * 沒有任何依據；現在後端用 TDX 的實際行駛時間算得出來，才把它放回去。
 *
 * 後端建一次路網圖快取一天，之後都是本地計算，所以這支查詢不吃 TDX 額度，
 * 前端也不需要特別節流。
 */

/*
 * /transit/plan 的回應是在 routes/transit.ts 裡當場組出來的，後端沒有一個具名型別，
 * 所以直接從 API 的型別推。各欄位的意思見那支端點的註解。
 */
export type RoutePlan = InferResponseType<typeof api.transit.plan.$get, 200>

/* 其他部分後端都有具名型別，用那些 —— 欄位說明（尤其是三態的 null）都在那邊 */
export type RouteLeg = LegTiming
export type MetroService = ServiceState
export type { MetroFare }
export type StationFacility = StationAccessibility
export type AccessibilityPoint = NonNullable<RoutePlan['accessibility']>[number]

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

export function useRoutePlan(
  from: string | null,
  to: string | null,
  /*
   * 要不要一起查轉乘站與出站口的電梯資訊。
   *
   * 預設關閉，由呼叫端依使用者的「優先顯示無障礙路線」偏好決定。
   * 它也是快取鍵的一部分 —— 不然開啟偏好之後會拿到之前沒帶設施資料的結果，
   * 畫面上那一段就永遠不會出現。
   */
  accessibility = false,
): PlanState {
  const key = from && to ? `${from}\u2192${to}${accessibility ? '\u2192a11y' : ''}` : null

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
    api.transit.plan
      .$get({ query: accessibility ? { from, to, accessibility: '1' } : { from, to } })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.json()
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
  }, [key, from, to, accessibility])

  if (!key) return { status: 'idle' }

  /* 快取直接在 render 期間讀，不繞一圈 state —— 切回這頁時不會閃一下載入中 */
  const cached = fresh(key)
  if (cached) return { status: 'ready', plan: cached }

  /* 還沒拿到這一組起訖的結果就是載入中，不要拿上一組的頂替 */
  return result?.key === key ? result.state : { status: 'loading' }
}
