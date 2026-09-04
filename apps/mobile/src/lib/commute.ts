import { useEffect, useSyncExternalStore } from 'react'

import { API_URL } from './api'
import { userHeaders } from './userRef'

/*
 * 使用者設定的通勤路線。
 *
 * 資料的真正歸屬在後端（GET/POST /commute/route），localStorage 只是快取：
 * 開啟 App 時先用快取把畫面畫出來，再跟後端對一次。沒有這層快取的話，
 * 每次切到行程頁都會先閃一下「還沒有常用路線」。
 *
 * 有兩個地方會設定路線，兩邊都收斂到這個 store：
 *   設定畫面的表單   → save()，直接 POST
 *   對話裡講出來的   → applyRoute()，後端的工具已經存好了，這裡只是同步畫面
 *
 * 刻意沒有「預估通勤時間」這個欄位：TDX 不提供旅行時間，
 * 在接上真正的路徑規劃之前，寧可不顯示，也不要編一個分鐘數出來。
 */

export type TransportMode = 'metro' | 'bus' | 'mixed'

export type CommuteRoute = {
  /** 出發站，例如「板橋站」 */
  origin: string
  /** 目的站，例如「市政府站」 */
  destination: string
  /** 主要運具 */
  mode: TransportMode
  /** 主要運具的路線名，例如「板南線」。後端推不出來時是 null，畫面就不顯示即時狀態。 */
  line: string | null
  /*
   * 通知時段。這是通知準確度的前提 —— 不知道使用者幾點通勤，
   * 就只能在半夜也推「板南線有異常」，那只會讓他把通知關掉。
   *   usualDays 空陣列 = 每天（不是「都不」）
   *   時間為 null     = 沒指定，後端會套 23:00–06:00 的靜音時段兜底
   */
  usualDays: string[]
  usualTimeStart: string | null
  usualTimeEnd: string | null
}

/** 星期的順序與代碼，跟後端 app.ts 的 DAYS 一致 */
export const WEEKDAYS = [
  { value: 'mon', label: '一' },
  { value: 'tue', label: '二' },
  { value: 'wed', label: '三' },
  { value: 'thu', label: '四' },
  { value: 'fri', label: '五' },
  { value: 'sat', label: '六' },
  { value: 'sun', label: '日' },
] as const

const STORAGE_KEY = 'yoxi.commuteRoute'

function isMode(value: unknown): value is TransportMode {
  return value === 'metro' || value === 'bus' || value === 'mixed'
}

/** 後端回應與 localStorage 共用同一套驗證 —— 兩邊的形狀本來就一樣 */
export function parseRoute(value: unknown): CommuteRoute | null {
  if (typeof value !== 'object' || value === null) return null

  const r = value as Record<string, unknown>
  const { origin, destination, mode, line } = r
  /* 少了起訖就不算一條路線，寧可當成沒設定過 */
  if (typeof origin !== 'string' || !origin.trim()) return null
  if (typeof destination !== 'string' || !destination.trim()) return null

  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)

  return {
    origin,
    destination,
    /* 舊版快取沒有 mode，補成捷運 —— 當時的設定流程只做得出捷運路線 */
    mode: isMode(mode) ? mode : 'metro',
    line: text(line),
    usualDays: Array.isArray(r.usualDays)
      ? r.usualDays.filter((d): d is string => typeof d === 'string')
      : [],
    usualTimeStart: text(r.usualTimeStart),
    usualTimeEnd: text(r.usualTimeEnd),
  }
}

/**
 * 可以拿去查即時狀態的捷運路線名，沒有就回 null。
 *
 * 公車路線的 line 是路線號碼（「307」），丟給 /transit/metro 一定查不到，
 * 畫面會顯示「狀態未知」—— 那不是未知，是問錯地方了。公車的即時到站
 * 要走 /transit/bus，在那條接進畫面之前，寧可不顯示狀態。
 */
export function metroLineOf(route: CommuteRoute): string | null {
  return route.mode === 'bus' ? null : route.line
}

function loadCache(): CommuteRoute | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? parseRoute(JSON.parse(raw)) : null
  } catch {
    /* 無痕視窗或封鎖 cookie 時 localStorage 會直接丟例外 */
    return null
  }
}

function writeCache(next: CommuteRoute | null) {
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 存不進去也沒關係，這次工作階段還是有值 */
  }
}

type State = {
  route: CommuteRoute | null
  /** 還沒跟後端對過。畫面用它決定要不要顯示「同步中」，不要用來擋整頁。 */
  syncing: boolean
}

let state: State = { route: loadCache(), syncing: false }
const listeners = new Set<() => void>()

function patch(next: Partial<State>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/* 只跟後端對一次。多個畫面同時掛載時不要各打一次。 */
let refreshed: Promise<void> | null = null

async function fetchRoute(): Promise<CommuteRoute | null> {
  const res = await fetch(`${API_URL}/commute/route`, { headers: userHeaders() })
  if (!res.ok) throw new Error(`伺服器回應 ${res.status}`)
  const body = (await res.json()) as { route?: unknown }
  return parseRoute(body.route)
}

export function refresh(): Promise<void> {
  if (refreshed) return refreshed

  patch({ syncing: true })
  refreshed = fetchRoute()
    .then((route) => {
      /*
       * 後端說沒有就是沒有，快取要跟著清掉 —— 否則在別的裝置刪掉路線之後，
       * 這台會永遠顯示一條已經不存在的路線。
       */
      writeCache(route)
      patch({ route })
    })
    .catch((error: unknown) => {
      /*
       * 連不上後端不該讓畫面壞掉，先沿用快取。
       * 但這次的失敗不記住，下次進畫面還會再試一次。
       */
      console.warn('[commute] 讀取通勤路線失敗，暫時沿用本機快取：', error)
      refreshed = null
    })
    .finally(() => {
      patch({ syncing: false })
    })

  return refreshed
}

export type SaveCommuteRouteInput = {
  origin: string
  destination: string
  mode: TransportMode
  /** 使用者自己指定的路線名；沒給就由後端從起訖站推 */
  line?: string | null
  /** 空陣列 = 每天 */
  usualDays?: string[]
  /** 兩個必須成對給，只給一邊後端會回 400 */
  usualTimeStart?: string | null
  usualTimeEnd?: string | null
}

export type SaveCommuteRouteResult = {
  route: CommuteRoute
  /** 起訖站沒有共同路線，代表中途要轉乘 */
  transferRequired: boolean
  /** 後端沒有接資料庫時為 false，重開 App 就沒了 */
  persisted: boolean
}

/**
 * 儲存路線。存的是後端回來的版本，不是送出去的版本 ——
 * 路線名是後端推的，直接沿用送出去的內容會少掉它。
 */
export async function save(input: SaveCommuteRouteInput): Promise<SaveCommuteRouteResult> {
  const res = await fetch(`${API_URL}/commute/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...userHeaders() },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(detail?.error ?? `伺服器回應 ${res.status}`)
  }

  const body = (await res.json()) as {
    route?: unknown
    transferRequired?: unknown
    persisted?: unknown
  }
  const route = parseRoute(body.route)
  if (!route) throw new Error('伺服器回傳的路線格式不正確')

  writeCache(route)
  patch({ route })
  /* 已經拿到最新狀態，不用再跟後端對一次 */
  refreshed = Promise.resolve()

  return {
    route,
    transferRequired: body.transferRequired === true,
    persisted: body.persisted !== false,
  }
}

/**
 * 對話裡設定好的路線。後端的工具已經寫進資料庫了，這裡只負責讓畫面跟上，
 * 所以不再打一次 POST。
 */
export function applyRoute(route: CommuteRoute) {
  writeCache(route)
  patch({ route })
  refreshed = Promise.resolve()
}

export async function clear(): Promise<void> {
  writeCache(null)
  patch({ route: null })
  refreshed = Promise.resolve()

  const res = await fetch(`${API_URL}/commute/route`, {
    method: 'DELETE',
    headers: userHeaders(),
  })
  if (!res.ok && res.status !== 404) {
    /* 本機已經清掉了，但後端還留著 —— 下次 refresh 會把它撿回來，所以要讓呼叫端知道 */
    refreshed = null
    throw new Error(`伺服器回應 ${res.status}`)
  }
}

export function useCommuteRoute() {
  const current = useSyncExternalStore(subscribe, () => state)

  /* 第一個用到路線的畫面負責觸發同步；refresh 自己會去重 */
  useEffect(() => {
    void refresh()
  }, [])

  return {
    route: current.route,
    configured: current.route !== null,
    syncing: current.syncing,
  }
}
