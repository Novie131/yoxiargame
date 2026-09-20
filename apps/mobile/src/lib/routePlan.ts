import { useEffect, useState } from 'react'

import { API_URL } from './api'
import type { RideEstimate } from './ride'

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
  /*
   * 還有車，但末班車就在 30 分鐘內。
   *
   * minutesLeft 是**末班車到站**的時間，不含走到車站要花的時間 ——
   * 畫面上一定要講清楚是哪一種，不然「還有 8 分鐘」會被讀成
   * 「你還有 8 分鐘可以出門」，那是一個會讓人趕去車站然後撲空的誤會。
   */
  | {
      status: 'closing-soon'
      station: string
      line: string
      /** 這個方向的終點站。末班車分方向，不講方向的倒數沒有意義。 */
      towards: string
      minutesLeft: number
      firstTrain: string
      lastTrain: string
    }

/** 捷運票價。後端查不到時整個是 null，不要用距離推一個。 */
export type MetroFare = {
  /** 單程票全票（元） */
  singleJourney: number
  /*
   * 這是哪一種票。要跟數字一起顯示 —— TDX 只公告單程票，
   * 悠遊卡實際上有折扣，少了這句話使用者會以為這就是他會付的錢。
   */
  basis: string
}

/** 一站的無障礙資訊。形狀跟後端的 StationAccessibility 一致。 */
export type StationFacility = {
  stationId: string
  /*
   * 三態，一定要分得出來：
   *   true  有登錄、而且有電梯出口
   *   false 有登錄、但沒有電梯出口
   *   null  TDX 沒有登錄 —— 我們不知道，畫面要寫「查無資料」
   */
  hasElevator: boolean | null
  elevatorExits: Array<{
    exitId: string
    name: string
    elevator: boolean | null
    escalator: boolean | null
    locationDescription: string | null
  }>
  exitCount: number
}

export type AccessibilityPoint = {
  /** transfer = 轉乘站，exit = 出站的那一站 */
  role: 'transfer' | 'exit'
  station: string
  stationId: string
  /** null 代表查不到，不是「沒有電梯」 */
  facility: StationFacility | null
}

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
  /** 公告票價。查不到就是 null，畫面就不顯示票價那一行。 */
  fare: MetroFare | null
  /*
   * 收班／快收班時的叫車估價。其他時候是 null ——
   * 每次查路線都附一個叫車價，就是在推銷。
   * 依公告費率估算，不是 yoxi 報價，basis 要一起顯示。
   */
  rideFallback: RideEstimate | null
  /** 只有帶 accessibility=1 查詢時才有值 */
  accessibility: AccessibilityPoint[] | null
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
    fetch(
      `${API_URL}/transit/plan?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` +
        (accessibility ? '&accessibility=1' : ''),
    )
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
  }, [key, from, to, accessibility])

  if (!key) return { status: 'idle' }

  /* 快取直接在 render 期間讀，不繞一圈 state —— 切回這頁時不會閃一下載入中 */
  const cached = fresh(key)
  if (cached) return { status: 'ready', plan: cached }

  /* 還沒拿到這一組起訖的結果就是載入中，不要拿上一組的頂替 */
  return result?.key === key ? result.state : { status: 'loading' }
}
