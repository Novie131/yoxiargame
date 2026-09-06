import { useEffect, useSyncExternalStore } from 'react'

import { API_URL } from './api'

/*
 * 使用者位置。
 *
 * 天氣列、探索地圖與對話助理都要用，所以抽成同一份 —— 兩邊各自呼叫
 * geolocation 的話，權限提示會跳兩次，退路座標也可能不一致。
 *
 * 三種來源，優先序就是這個順序：
 *   manual    使用者自己指定的地點。定位被拒時他總得有辦法告訴我們他在哪。
 *   gps       瀏覽器定位。
 *   fallback  兩者都沒有時的退路（台北市信義區）。
 *
 * precise 這個旗標很重要：畫面可以用退路座標決定要看哪裡，但**不能**在那個
 * 座標上畫一個「你在這裡」的點，那是在騙人。手動指定的地點 precise 也是
 * false —— 它是使用者說的一個地區，不是他站的那一點。
 */

export type LocationSource = 'gps' | 'manual' | 'fallback'

/*
 * 定位的取得狀態。畫面靠它決定要不要跳「開啟定位」的提示 ——
 * 只看 precise 是不夠的，「被拒絕」與「還在定位中」要給的回應完全不同。
 */
export type LocationStatus = 'locating' | 'gps' | 'manual' | 'denied' | 'unavailable'

export type UserLocation = {
  lat: number
  lon: number
  /** false 代表這不是使用者真正的所在地（退路座標或他手動指定的地區） */
  precise: boolean
  source: LocationSource
  /** 手動指定時的地點名稱。GPS 與退路為 null。 */
  label: string | null
}

/* 台北市信義區（市政府一帶）。定位拿不到又沒手動指定時的預設位置。 */
export const FALLBACK_LOCATION: UserLocation = {
  lat: 25.0375,
  lon: 121.5637,
  precise: false,
  source: 'fallback',
  label: null,
}

export const FALLBACK_LABEL = '台北市信義區'

/* 跟天氣的快取時間一致，切分頁回來不用重新要一次權限 */
const TTL_MS = 10 * 60 * 1000
const TIMEOUT_MS = 8000

const MANUAL_KEY = 'yoxi.location.manual'

type State = { location: UserLocation; status: LocationStatus }

/* localStorage 在無痕視窗與某些隱私設定下會直接丟例外，一律包起來 */
function readManual(): UserLocation | null {
  try {
    const raw = localStorage.getItem(MANUAL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<UserLocation>
    if (typeof parsed.lat !== 'number' || typeof parsed.lon !== 'number') return null
    if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lon)) return null
    return {
      lat: parsed.lat,
      lon: parsed.lon,
      precise: false,
      source: 'manual',
      label: typeof parsed.label === 'string' ? parsed.label : null,
    }
  } catch {
    return null
  }
}

function writeManual(location: UserLocation | null) {
  try {
    if (location) {
      localStorage.setItem(
        MANUAL_KEY,
        JSON.stringify({ lat: location.lat, lon: location.lon, label: location.label }),
      )
    } else {
      localStorage.removeItem(MANUAL_KEY)
    }
  } catch {
    /* 存不進去就只有這一次 session 有效，不值得為此中斷流程 */
  }
}

const manual = readManual()

let state: State = manual
  ? { location: manual, status: 'manual' }
  : { location: FALLBACK_LOCATION, status: 'locating' }

/* 上一次 GPS 定位成功的時間。手動指定時不看這個。 */
let gpsAt = 0
let inflight: Promise<UserLocation> | null = null

const listeners = new Set<() => void>()

function patch(next: State) {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/*
 * 向瀏覽器要一次定位。
 *
 * 失敗要分辨是「被拒絕」還是「拿不到」：前者要引導使用者去系統設定或
 * 手動選一個地點，後者再試一次就好。以前一律走退路，畫面沒辦法講清楚。
 */
function requestGps(): Promise<UserLocation> {
  if (inflight) return inflight

  inflight = new Promise<UserLocation>((resolve) => {
    if (!('geolocation' in navigator)) {
      patch({ location: state.location, status: 'unavailable' })
      resolve(state.location)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (p) => {
        const located: UserLocation = {
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          precise: true,
          source: 'gps',
          label: null,
        }
        gpsAt = Date.now()
        /* 手動指定優先，所以定位成功也不覆蓋它 —— 只把座標記下來備用 */
        if (state.location.source === 'manual') resolve(state.location)
        else {
          patch({ location: located, status: 'gps' })
          resolve(located)
        }
      },
      (error) => {
        /* code 1 = PERMISSION_DENIED，其餘是逾時或定位失敗 */
        const status: LocationStatus = error.code === 1 ? 'denied' : 'unavailable'
        if (state.location.source !== 'manual') {
          patch({ location: FALLBACK_LOCATION, status })
        }
        resolve(state.location)
      },
      { timeout: TIMEOUT_MS, maximumAge: TTL_MS },
    )
  }).finally(() => {
    inflight = null
  })

  return inflight
}

/** 取得位置。多個畫面同時要時共用同一次請求與十分鐘內的結果。 */
export function locate(): Promise<UserLocation> {
  if (state.location.source === 'manual') return Promise.resolve(state.location)
  if (state.location.source === 'gps' && Date.now() - gpsAt < TTL_MS) {
    return Promise.resolve(state.location)
  }
  return requestGps()
}

/**
 * 重新向瀏覽器要一次定位，忽略快取。
 * 給「開啟定位」按鈕用 —— 使用者剛在系統設定裡打開權限，要能立刻生效。
 */
export function requestLocation(): Promise<UserLocation> {
  gpsAt = 0
  if (state.status !== 'manual') patch({ location: state.location, status: 'locating' })
  return requestGps()
}

/**
 * 地名 → 座標，走後端的 /geocode。
 *
 * 不直接從瀏覽器打 Nominatim：它的使用條款要求可識別的 User-Agent 並限制頻率，
 * 那兩件事在瀏覽器裡都做不到。查不到回 null，呼叫端要照實說查不到。
 */
export async function lookupPlace(
  query: string,
): Promise<{ lat: number; lon: number; name: string } | null> {
  const q = query.trim()
  if (!q) return null

  const res = await fetch(`${API_URL}/geocode?q=${encodeURIComponent(q)}`)
  if (!res.ok) return null
  return (await res.json()) as { lat: number; lon: number; name: string }
}

/** 使用者手動指定所在地。會存起來，下次開 App 還在。 */
export function setManualLocation(lat: number, lon: number, label: string) {
  const location: UserLocation = { lat, lon, precise: false, source: 'manual', label }
  writeManual(location)
  patch({ location, status: 'manual' })
}

/** 清掉手動指定，回去用定位。 */
export function clearManualLocation() {
  writeManual(null)
  gpsAt = 0
  patch({ location: FALLBACK_LOCATION, status: 'locating' })
  void requestGps()
}

/** 訂閱位置變動。給不是 React 元件的地方用（例如天氣的快取失效）。 */
export const subscribeLocation = subscribe

/** 目前這一刻的位置。要送進 API 請求時用這個，不要用 hook。 */
export const currentLocation = (): UserLocation => state.location

export const currentStatus = (): LocationStatus => state.status

/**
 * 位置與狀態。畫面要判斷「要不要提示開啟定位」時用這個。
 */
export function useLocationState(): State {
  const snapshot = useSyncExternalStore(subscribe, () => state)

  /*
   * 掛載時順手要一次定位。
   *
   * 一定要放在 effect 裡：requestGps 在「瀏覽器不支援定位」那條路上會同步
   * patch，在 render 期間呼叫就變成 render 中更新 store，React 會警告。
   * 重複呼叫沒有副作用，requestGps 自己會合流。
   */
  useEffect(() => {
    if (snapshot.status === 'locating') void requestGps()
  }, [snapshot.status])

  return snapshot
}

/**
 * 只要位置的簡化版。
 *
 * 初值直接給退路座標而不是 null，這樣畫面第一幀就有東西可畫，
 * 不用為「還在定位中」做一套額外的載入狀態。定位回來再換掉。
 */
export function useUserLocation(): UserLocation {
  return useLocationState().location
}
