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
 *
 * 一個人有兩條路線（上班、回家），由 label 區分，所以這個 store 存的是
 * 一張 label → 路線的表而不是單一物件。回程不是去程的反向 ——
 * 末班車分方向、尖峰離峰的班距完全不同 —— 所以它必須是獨立的一條。
 */

export type TransportMode = 'metro' | 'bus' | 'mixed'

/*
 * 路線的用途。跟後端 repositories/commute.ts 的 RouteLabel 一致。
 *
 * 刻意只有兩個固定值：讓使用者自己命名會變成一個沒人填的欄位，
 * 而兩條（上班／回家）已經解決 90% 的情況，更多就變成行程管理了。
 */
export type RouteLabel = 'commute' | 'home'

export const ROUTE_LABELS: RouteLabel[] = ['commute', 'home']

export const DEFAULT_ROUTE_LABEL: RouteLabel = 'commute'

export const ROUTE_LABEL_TEXT: Record<RouteLabel, { title: string; from: string; to: string }> = {
  commute: { title: '每日通勤', from: '住家', to: '公司' },
  home: { title: '回家路線', from: '公司', to: '住家' },
}

export function isRouteLabel(value: unknown): value is RouteLabel {
  return value === 'commute' || value === 'home'
}

export type CommuteRoute = {
  /** 這是上班那條還是回家那條 */
  label: RouteLabel
  /** 出發站，例如「板橋站」 */
  origin: string
  /** 目的站，例如「市政府站」 */
  destination: string
  /** 主要運具 */
  mode: TransportMode
  /** 主要運具的路線名，例如「板南線」。後端推不出來時是 null，畫面就不顯示即時狀態。 */
  line: string | null
  /*
   * TDX 城市代碼。只有公車需要 —— 公車路線名要搭配城市才查得到，
   * 「307」在臺北與臺中是完全不同的兩條線。
   */
  city: string | null
  /*
   * 通知時段。這是通知準確度的前提 —— 不知道使用者幾點通勤，
   * 就只能在半夜也推「板南線有異常」，那只會讓他把通知關掉。
   *   usualDays 空陣列 = 每天（不是「都不」）
   *   時間為 null     = 沒指定，後端會套 23:00–06:00 的靜音時段兜底
   */
  usualDays: string[]
  usualTimeStart: string | null
  usualTimeEnd: string | null
  /*
   * 幾點要到目的地（HH:MM）。出發倒數的時間錨點。
   *
   * 跟上面那兩個不是同一件事：它們講的是「什麼時段的異常要通知我」，
   * 這個講的是「我幾點要到」。null = 沒設定，行程頁就退回
   * 「現在出發約 N 分鐘」，不要猜一個時間。
   */
  arriveBy: string | null
  /*
   * 通勤異常通知的總開關。後端的輪詢是用這個欄位過濾的
   * （transit-watch 的 WHERE notification_enabled），關掉就真的不會再產生通知。
   */
  notificationEnabled: boolean
  /** 誤點幾分鐘才通知。目前還不能改，先讓設定頁顯示真實值而不是寫死的 5。 */
  delayThresholdMinutes: number
}

/*
 * 支援的公車縣市，值是 TDX 的城市代碼，跟後端 services/tdx.ts 的 BUS_CITIES 一致。
 * 打錯的話後端會回 400，不會默默查不到東西。
 */
export const BUS_CITIES = [
  { value: 'Taipei', label: '臺北' },
  { value: 'NewTaipei', label: '新北' },
  { value: 'Taoyuan', label: '桃園' },
  { value: 'Taichung', label: '臺中' },
  { value: 'Tainan', label: '臺南' },
  { value: 'Kaohsiung', label: '高雄' },
] as const

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
    /* 舊版快取沒有 label，一律當成上班那條 —— 當時只存得下一條 */
    label: isRouteLabel(r.label) ? r.label : DEFAULT_ROUTE_LABEL,
    origin,
    destination,
    /* 舊版快取沒有 mode，補成捷運 —— 當時的設定流程只做得出捷運路線 */
    mode: isMode(mode) ? mode : 'metro',
    line: text(line),
    city: text(r.city),
    usualDays: Array.isArray(r.usualDays)
      ? r.usualDays.filter((d): d is string => typeof d === 'string')
      : [],
    usualTimeStart: text(r.usualTimeStart),
    usualTimeEnd: text(r.usualTimeEnd),
    arriveBy: text(r.arriveBy),
    /*
     * 對話串流傳回來的事件沒有這兩個欄位（模型不需要知道），
     * 缺了就用後端建立路線時的預設值，不要當成關閉。
     */
    notificationEnabled: r.notificationEnabled !== false,
    delayThresholdMinutes:
      typeof r.delayThresholdMinutes === 'number' ? r.delayThresholdMinutes : 5,
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

/** label → 路線。沒設定的 label 就不在表裡。 */
export type RouteMap = Partial<Record<RouteLabel, CommuteRoute>>

function toMap(routes: CommuteRoute[]): RouteMap {
  const map: RouteMap = {}
  for (const route of routes) map[route.label] = route
  return map
}

/*
 * 讀快取。
 *
 * 舊版存的是單一物件（只有一條路線的時代），新版存陣列。
 * 兩種都要讀得回來 —— 直接當成壞掉的話，升級之後第一次開 App 會看到
 * 「還沒有常用路線」，而使用者明明設定過。
 */
function loadCache(): RouteMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const parsed: unknown = JSON.parse(raw)
    const list = Array.isArray(parsed) ? parsed : [parsed]
    return toMap(list.map(parseRoute).filter((r): r is CommuteRoute => r !== null))
  } catch {
    /* 無痕視窗或封鎖 cookie 時 localStorage 會直接丟例外 */
    return {}
  }
}

function writeCache(next: RouteMap) {
  try {
    const list = ROUTE_LABELS.map((label) => next[label]).filter(
      (r): r is CommuteRoute => r !== undefined,
    )
    if (list.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 存不進去也沒關係，這次工作階段還是有值 */
  }
}

type State = {
  routes: RouteMap
  /** 還沒跟後端對過。畫面用它決定要不要顯示「同步中」，不要用來擋整頁。 */
  syncing: boolean
}

let state: State = { routes: loadCache(), syncing: false }
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

async function fetchRoutes(): Promise<RouteMap> {
  const res = await fetch(`${API_URL}/commute/route`, { headers: userHeaders() })
  if (!res.ok) throw new Error(`伺服器回應 ${res.status}`)

  const body = (await res.json()) as { routes?: unknown; route?: unknown }
  /*
   * routes 是新的欄位。舊的後端只回 route（單數），這裡照樣讀得回來 ——
   * 前後端不會同時部署，中間那段時間畫面不該空掉。
   */
  const list = Array.isArray(body.routes) ? body.routes : [body.route]
  return toMap(list.map(parseRoute).filter((r): r is CommuteRoute => r !== null))
}

export function refresh(): Promise<void> {
  if (refreshed) return refreshed

  patch({ syncing: true })
  refreshed = fetchRoutes()
    .then((routes) => {
      /*
       * 後端說沒有就是沒有，快取要跟著清掉 —— 否則在別的裝置刪掉路線之後，
       * 這台會永遠顯示一條已經不存在的路線。
       */
      writeCache(routes)
      patch({ routes })
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
  /** 沒給就是上班那條 */
  label?: RouteLabel
  origin: string
  destination: string
  mode: TransportMode
  /** 使用者自己指定的路線名；沒給就由後端從起訖站推 */
  line?: string | null
  /** TDX 城市代碼。公車必要，捷運不用。 */
  city?: string | null
  /** 空陣列 = 每天 */
  usualDays?: string[]
  /** 兩個必須成對給，只給一邊後端會回 400 */
  usualTimeStart?: string | null
  usualTimeEnd?: string | null
  /*
   * 幾點要到目的地（HH:MM）。出發倒數的時間錨點。
   * 跟上面那兩個無關，可以單獨給。沒給就沒有倒數。
   */
  arriveBy?: string | null
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
  const { label = DEFAULT_ROUTE_LABEL, ...body } = input

  /* label 走查詢參數，其餘走 body —— 跟後端 app.ts 的 parseLabel 對齊 */
  const res = await fetch(`${API_URL}/commute/route?label=${label}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...userHeaders() },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(detail?.error ?? `伺服器回應 ${res.status}`)
  }

  const saved = (await res.json()) as {
    route?: unknown
    transferRequired?: unknown
    persisted?: unknown
  }
  const route = parseRoute(saved.route)
  if (!route) throw new Error('伺服器回傳的路線格式不正確')

  /* 只換掉這一個 label，另一條不受影響 */
  const routes = { ...state.routes, [route.label]: route }
  writeCache(routes)
  patch({ routes })
  /* 已經拿到最新狀態，不用再跟後端對一次 */
  refreshed = Promise.resolve()

  return {
    route,
    transferRequired: saved.transferRequired === true,
    persisted: saved.persisted !== false,
  }
}

/**
 * 開關通勤異常通知。
 *
 * 先改本機再送出：開關是使用者期待「按下去就變」的東西，等一趟往返會很鈍。
 * 失敗就把狀態轉回去並拋出，讓畫面能說明發生什麼事 ——
 * 通知這種東西默默沒設定成功是最糟的。
 */
export async function setNotificationEnabled(
  enabled: boolean,
  label: RouteLabel = DEFAULT_ROUTE_LABEL,
): Promise<void> {
  const previous = state.routes
  const current = previous[label]
  if (!current) throw new Error('尚未設定這條路線')

  const optimistic = { ...previous, [label]: { ...current, notificationEnabled: enabled } }
  writeCache(optimistic)
  patch({ routes: optimistic })

  try {
    const res = await fetch(`${API_URL}/commute/route?label=${label}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...userHeaders() },
      body: JSON.stringify({ notificationEnabled: enabled }),
    })
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(detail?.error ?? `伺服器回應 ${res.status}`)
    }

    const body = (await res.json()) as { route?: unknown }
    const route = parseRoute(body.route)
    if (route) {
      const routes = { ...state.routes, [route.label]: route }
      writeCache(routes)
      patch({ routes })
    }
  } catch (error) {
    /* 沒改成功就不要留著一個看起來已經改好的畫面 */
    writeCache(previous)
    patch({ routes: previous })
    throw error
  }
}

/**
 * 對話裡設定好的路線。後端的工具已經寫進資料庫了，這裡只負責讓畫面跟上，
 * 所以不再打一次 POST。
 */
export function applyRoute(route: CommuteRoute) {
  /*
   * 只換掉事件帶的那一條。
   *
   * 沒有這個 label 的話，使用者用講的設定回家路線，畫面會把它蓋到上班那條上，
   * 而且看起來像設定成功了 —— 那是最難發現的一種錯。
   */
  const routes = { ...state.routes, [route.label]: route }
  writeCache(routes)
  patch({ routes })
  refreshed = Promise.resolve()
}

export async function clear(label: RouteLabel = DEFAULT_ROUTE_LABEL): Promise<void> {
  const previous = state.routes
  const routes = { ...previous }
  delete routes[label]

  writeCache(routes)
  patch({ routes })
  refreshed = Promise.resolve()

  const res = await fetch(`${API_URL}/commute/route?label=${label}`, {
    method: 'DELETE',
    headers: userHeaders(),
  })
  if (!res.ok && res.status !== 404) {
    /* 本機已經清掉了，但後端還留著 —— 下次 refresh 會把它撿回來，所以要讓呼叫端知道 */
    refreshed = null
    throw new Error(`伺服器回應 ${res.status}`)
  }
}

/**
 * 所有路線。
 *
 * `route` 保留著且永遠是上班那條 —— 既有的呼叫端（行程頁的下一段卡、
 * 設定頁的通知開關）不用改就能繼續用，要顯示兩條的畫面讀 `routes`。
 */
export function useCommuteRoutes() {
  const current = useSyncExternalStore(subscribe, () => state)

  /* 第一個用到路線的畫面負責觸發同步；refresh 自己會去重 */
  useEffect(() => {
    void refresh()
  }, [])

  const list = ROUTE_LABELS.map((label) => current.routes[label]).filter(
    (r): r is CommuteRoute => r !== undefined,
  )

  return {
    routes: current.routes,
    /** 上班那條在前。畫面不要自己排，三個地方各排各的會出現三種順序。 */
    list,
    route: current.routes[DEFAULT_ROUTE_LABEL] ?? null,
    configured: list.length > 0,
    syncing: current.syncing,
  }
}

/** 單一 label 的路線。只關心其中一條的畫面用這個。 */
export function useCommuteRoute(label: RouteLabel = DEFAULT_ROUTE_LABEL) {
  const { routes, syncing } = useCommuteRoutes()
  const route = routes[label] ?? null
  return { route, configured: route !== null, syncing }
}
