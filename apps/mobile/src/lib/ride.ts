import type { RideEstimate } from '@api/services/ride.ts'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { api, coordsQuery } from './client'
import { lookupPlace } from './location'

/*
 * 叫車流程的狀態。
 *
 * 在這之前，叫車那四頁各自把設計稿的數字寫死（8.5 公里、NT$250-320、
 * 陳建宏 / TOYOTA / TDA-8899、12 分鐘、NT$285），頁跟頁之間毫無關係 ——
 * 從探索頁帶著「大安森林公園」進來，估價頁照樣顯示松山機場的車資。
 *
 * 現在整條流程共用同一筆資料：上車點、下車點、估價、車型、司機、叫車時間。
 *
 * ── 哪些是真的，哪些不是 ──
 *
 *   上車／下車點   真的。使用者選的，有座標
 *   距離／車程／車資 估算。後端依臺北市公告費率算，**不是 yoxi 報價**
 *   司機與車輛     **模擬的**。沒有接派車系統，畫面上必須標示出來
 *   抵達倒數       從叫車時間推算的模擬進度，同上
 *
 * 存在 sessionStorage 而不是 localStorage：一趟車是「這次」的事，
 * 關掉 App 再打開不該還停在三天前那趟的「司機前往中」。
 */

export type RidePlace = {
  label: string
  lat: number
  lon: number
}

/* 估價的形狀直接用後端的（services/ride.ts）。basis 一定要顯示，理由在那邊的註解。 */
export type { RideEstimate }

export type Driver = {
  name: string
  car: string
  plate: string
  rating: number
  /** 從叫車到抵達上車點的分鐘數 */
  arrivingMinutes: number
}

export type ActiveRide = {
  pickup: RidePlace
  dropoff: RidePlace
  estimate: RideEstimate
  carType: string
  driver: Driver
  /** 按下「確認叫車」的時間，用來推算模擬進度 */
  bookedAt: number
  /**
   * 這趟是從「通勤延誤救援」叫的。結算頁靠它顯示救援版（多一條「比台鐵提早抵達」）。
   * 選填：存在 sessionStorage 裡的舊資料沒有這個欄位，讀到 undefined 就是一般行程。
   */
  rescue?: boolean
}

/*
 * 模擬的司機。數值取自設計稿 yoxi-driver-arriving.png。
 *
 * 保留設計稿的人名與車牌，是因為 demo 時畫面要跟設計稿對得起來；
 * 但畫面上必須同時標示「模擬派車」—— 一個看起來完全像真的司機卡片，
 * 會讓看 demo 的人以為派車已經接通了。
 */
const DEMO_DRIVER: Driver = {
  name: '陳建宏',
  car: 'TOYOTA Altis・白色',
  plate: 'TDA-8899',
  rating: 4.9,
  arrivingMinutes: 3,
}

const KEY = 'yoxi.ride.active'

function read(): ActiveRide | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ActiveRide
    /* 結構壞掉就當作沒有，不要讓整個叫車流程因為一筆舊資料而炸掉 */
    if (!parsed?.pickup?.label || !parsed?.dropoff?.label || !parsed?.estimate) return null
    return parsed
  } catch {
    return null
  }
}

function write(ride: ActiveRide | null) {
  try {
    if (ride) sessionStorage.setItem(KEY, JSON.stringify(ride))
    else sessionStorage.removeItem(KEY)
  } catch {
    /* 存不進去就只有這次有效，不值得為此中斷叫車 */
  }
}

let active: ActiveRide | null = read()
const listeners = new Set<() => void>()

function patch(next: ActiveRide | null) {
  active = next
  write(next)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/*
 * ── 延誤救援標記 ──
 *
 * 救援彈窗按「立即叫車救援」之後，要經過估價頁、司機頁、行程頁才會到結算頁，
 * 而那幾頁都不知道（也不該知道）這趟是不是救援。
 *
 * 所以標記不走網址參數一路傳下去，而是先記一筆「下一趟是救援」，
 * 由 startRide 在建立行程時收下並寫進那一趟 —— 從此跟著行程走，
 * 中間任何一頁都不用改。
 *
 * 給它一個有效期限：按了救援、中途放棄、半小時後再正常叫一趟車，
 * 那一趟不該被當成救援。
 */
const RESCUE_KEY = 'yoxi.ride.rescuePending'
const RESCUE_TTL_MS = 30 * 60 * 1000

/** 標記「接下來叫的這一趟是延誤救援」。救援彈窗的主按鈕呼叫。 */
export function markNextRideAsRescue() {
  try {
    sessionStorage.setItem(RESCUE_KEY, String(Date.now()))
  } catch {
    /* 存不進去頂多結算頁顯示一般版，不值得擋住叫車 */
  }
}

/** 收下救援標記（只能收一次），回傳這一趟是不是救援 */
function takeRescueMark(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RESCUE_KEY))
    sessionStorage.removeItem(RESCUE_KEY)
    return Number.isFinite(at) && at > 0 && Date.now() - at < RESCUE_TTL_MS
  } catch {
    return false
  }
}

/** 確認叫車。回傳建立好的那一趟。 */
export function startRide(input: Omit<ActiveRide, 'driver' | 'bookedAt' | 'rescue'>): ActiveRide {
  const ride: ActiveRide = {
    ...input,
    driver: DEMO_DRIVER,
    bookedAt: Date.now(),
    rescue: takeRescueMark(),
  }
  patch(ride)
  return ride
}

/** 行程結束或取消。 */
export function endRide() {
  patch(null)
}

/*
 * ── 已完成的那一趟 ──
 *
 * 結算頁要顯示剛結束那趟的里程與車資，但 endRide 會把行程清掉 ——
 * 行程頁按「完成行程」之後，結算頁就讀不到了。
 *
 * 所以「完成」跟「取消」分開：completeRide 先把這趟留一份快照再結束，
 * 取消（司機頁的 endRide）不留，才不會把取消掉的那趟拿去結算。
 * 一樣放 sessionStorage，理由同上：結算是「這次」的事。
 */
export type CompletedRide = ActiveRide & {
  /** 按下「完成行程」的時間，結算頁的抵達時間從這裡來 */
  completedAt: number
}

const COMPLETED_KEY = 'yoxi.ride.completed'

function readCompleted(): CompletedRide | null {
  try {
    const raw = sessionStorage.getItem(COMPLETED_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CompletedRide
    if (!parsed?.pickup?.label || !parsed?.dropoff?.label || !parsed?.estimate) return null
    return parsed
  } catch {
    return null
  }
}

let completed: CompletedRide | null = readCompleted()

function patchCompleted(next: CompletedRide | null) {
  completed = next
  try {
    if (next) sessionStorage.setItem(COMPLETED_KEY, JSON.stringify(next))
    else sessionStorage.removeItem(COMPLETED_KEY)
  } catch {
    /* 存不進去就只有這次有效 */
  }
  for (const listener of listeners) listener()
}

/** 行程完成：留下結算用的快照，再結束行程。沒有進行中的行程時什麼都不做。 */
export function completeRide() {
  if (active) patchCompleted({ ...active, completedAt: Date.now() })
  patch(null)
}

/** 結算頁按「確認並完成行程」之後清掉，下一趟不會看到上一趟的帳 */
export function clearCompletedRide() {
  patchCompleted(null)
}

export function useCompletedRide(): CompletedRide | null {
  return useSyncExternalStore(subscribe, () => completed)
}

export function useActiveRide(): ActiveRide | null {
  return useSyncExternalStore(subscribe, () => active)
}

/*
 * 原型導覽（/dev）專用：直接開一趟示範行程。
 *
 * 需要它的理由：司機頁與行程進行中頁現在讀的是實際叫的那一趟，沒有就跳回叫車頁。
 * 那對正常流程是對的（重新整理、直接貼網址都不該停在半途），但 /dev 的用途
 * 就是「跳到任一畫面看設計」，少了這個，那兩張稿在導覽裡點不開。
 *
 * 估價仍然是**真的**去打後端，不是寫死的數字 —— 這支只省掉選地點那一步。
 * 目的地固定用臺北 101，因為那是設計稿 yoxi-trip-in-progress 上的地方。
 */
const DEMO_PICKUP: RidePlace = { label: '臺北車站', lat: 25.0478, lon: 121.517 }
const DEMO_DROPOFF: RidePlace = { label: '臺北101', lat: 25.0338, lon: 121.5645 }

export async function startDemoRide(): Promise<boolean> {
  try {
    const res = await api.ride.estimate.$get({ query: coordsQuery(DEMO_PICKUP, DEMO_DROPOFF) })
    if (!res.ok) return false

    startRide({
      pickup: DEMO_PICKUP,
      dropoff: DEMO_DROPOFF,
      estimate: await res.json(),
      carType: '轎車',
    })
    return true
  } catch {
    return false
  }
}

/*
 * ── 模擬進度 ──
 *
 * 沒有接派車系統，所以「司機還有幾分鐘到」是從按下確認叫車的時間推算的。
 *
 * 時間有壓縮：真實世界等 3 分鐘再等 20 分鐘的車程，demo 沒有人會坐在那裡等。
 * 壓縮倍率寫成常數而不是散在各頁，並且**畫面上要標示「示範速度」**——
 * 一個看起來像真的倒數卻跑得比真實快 30 倍，會讓看 demo 的人誤判這是實裝。
 *
 * 接上真實派車之後，這一段整個換成司機位置的推播，倍率常數一併刪掉。
 */
export const DEMO_SPEEDUP = 30

export type RidePhase = 'arriving' | 'onboard' | 'finished'

export type RideProgress = {
  phase: RidePhase
  /** 司機距離上車點還有幾分鐘（模擬） */
  driverMinutes: number
  /** 到達目的地還有幾分鐘（模擬） */
  tripMinutes: number
}

function progressOf(ride: ActiveRide, now: number): RideProgress {
  /* 壓縮後的「已經過了幾分鐘」 */
  const elapsed = ((now - ride.bookedAt) / 60_000) * DEMO_SPEEDUP

  const toPickup = ride.driver.arrivingMinutes
  const total = toPickup + ride.estimate.durationMinutes

  if (elapsed < toPickup) {
    return {
      phase: 'arriving',
      driverMinutes: Math.max(1, Math.ceil(toPickup - elapsed)),
      tripMinutes: ride.estimate.durationMinutes,
    }
  }
  if (elapsed < total) {
    return {
      phase: 'onboard',
      driverMinutes: 0,
      tripMinutes: Math.max(1, Math.ceil(total - elapsed)),
    }
  }
  return { phase: 'finished', driverMinutes: 0, tripMinutes: 0 }
}

/**
 * 每秒重算一次的模擬進度。沒有進行中的行程時回 null。
 *
 * 用 setInterval 而不是 requestAnimationFrame：畫面上顯示的是分鐘，
 * 一秒更新一次綽綽有餘，而 rAF 在背景分頁會停掉。
 */
export function useRideProgress(ride: ActiveRide | null): RideProgress | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!ride) return
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [ride])

  return ride ? progressOf(ride, now) : null
}

/*
 * ── 把「網址上的地點」變成可以估價的地點 ──
 *
 * 進叫車流程的入口有三種，帶的東西不一樣：
 *
 *   探索頁任務      地名 + 座標（任務本來就有座標）
 *   對話的估價卡    地名 + 座標（工具解析過了）
 *   通勤異常通知    **只有地名** —— transit-watch 的 rideAction 帶的是
 *                   使用者通勤路線的起訖站名，那裡沒有座標可帶
 *
 * 第三種如果不處理，從通知點進來會看到「尚未選擇目的地」，
 * 而那正是這個通知唯一的用途。所以缺座標時自己查一次。
 */
export type ResolvedPlaceState =
  | { status: 'resolving' }
  | { status: 'ready'; place: RidePlace }
  | { status: 'none' }

export function useResolvedPlace(
  label: string | null,
  lat: number | null,
  lon: number | null,
  /** 查不到、也沒有地名時的退路（例如使用者目前位置） */
  fallback: RidePlace | null = null,
): ResolvedPlaceState {
  const [looked, setLooked] = useState<{ label: string; place: RidePlace | null } | null>(null)

  const needsLookup = Boolean(label) && (lat === null || lon === null)

  useEffect(() => {
    if (!needsLookup || !label) return

    let alive = true
    lookupPlace(label)
      .then((found) => {
        if (!alive) return
        setLooked({
          label,
          place: found ? { label: found.name, lat: found.lat, lon: found.lon } : null,
        })
      })
      .catch(() => {
        if (alive) setLooked({ label, place: null })
      })

    return () => {
      alive = false
    }
  }, [needsLookup, label])

  if (label && lat !== null && lon !== null) {
    return { status: 'ready', place: { label, lat, lon } }
  }

  if (needsLookup) {
    if (looked?.label !== label) return { status: 'resolving' }
    if (looked.place) return { status: 'ready', place: looked.place }
    /* 查不到就退到 fallback（上車點用得到），沒有 fallback 就是沒有 */
    return fallback ? { status: 'ready', place: fallback } : { status: 'none' }
  }

  return fallback ? { status: 'ready', place: fallback } : { status: 'none' }
}

/*
 * ── 估價 ──
 */

export type RideEstimateState =
  | { status: 'loading' }
  | { status: 'ready'; data: RideEstimate }
  | { status: 'error' }

/*
 * 估價跟「現在幾點」有關（尖峰、離峰、夜間加成），所以快取不能久放。
 * 兩分鐘，跟後端的 Cache-Control 一致。
 */
const TTL_MS = 2 * 60 * 1000
const cache = new Map<string, { at: number; data: RideEstimate }>()

export function useRideEstimate(
  from: { lat: number; lon: number } | null,
  to: { lat: number; lon: number } | null,
): RideEstimateState {
  /* 座標取到小數第四位（約 10 公尺）當快取鍵，跟 tripOptions 一致 */
  const key =
    from && to
      ? `${from.lat.toFixed(4)},${from.lon.toFixed(4)}→${to.lat.toFixed(4)},${to.lon.toFixed(4)}`
      : null

  const [result, setResult] = useState<{ key: string; state: RideEstimateState } | null>(null)

  useEffect(() => {
    if (!key || !from || !to) return

    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL_MS) return

    let alive = true
    api.ride.estimate
      .$get({ query: coordsQuery(from, to) })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.json()
      })
      .then((data) => {
        cache.set(key, { at: Date.now(), data })
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
  if (result?.key === key) return result.state

  /*
   * 有快取就先給舊的，effect 那邊會判斷過期並重打（stale-while-revalidate）。
   * 過期與否刻意**不在這裡**判斷：render 期間呼叫 Date.now() 是不純的，
   * 同一次 render 的兩次呼叫可能跨過門檻，畫面就會閃一下。
   */
  const hit = cache.get(key)
  return hit ? { status: 'ready', data: hit.data } : { status: 'loading' }
}

/*
 * 車資的顯示字串。
 *
 * 上下界相同時只印一個數字 —— 深夜沒有塞車假設，區間會收斂成一點，
 * 那時候印「NT$250-250」看起來像壞掉了。
 */
export function formatFare(fare: { min: number; max: number }): string {
  return fare.min === fare.max ? `NT$${fare.min}` : `NT$${fare.min}-${fare.max}`
}

/** 路況的中文說法。估價旁邊要講清楚這個數字是哪種路況下的。 */
export function trafficLabel(traffic: RideEstimate['traffic']): string {
  return traffic === 'peak' ? '尖峰時段' : traffic === 'night' ? '深夜時段' : '離峰時段'
}
