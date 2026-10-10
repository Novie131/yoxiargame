import { useMemo } from 'react'

import { useCommuteRoute } from './commute'
import { useResolvedPlace, useRideEstimate, type RideEstimateState } from './ride'
import { useTripOptions, type MetroOption } from './tripOptions'

/*
 * 「雨天通勤・yoxi 優先」四頁（Figma 499:1800 / 499:1916 / 499:2039 / 499:2185）共用的資料。
 *
 * ── 哪些是真的，哪些不是 ──
 *
 *   起訖           使用者設定的上班路線（站名）；沒設定就用情境的 板橋 → 市政府
 *   叫車車程／車資 真的估算：跟估價頁同一支 useRideEstimate、同一組座標，
 *                  所以這幾頁的數字跟按下去之後的估價頁**一定一樣**（同一份快取）
 *   捷運時間／票價 真的：/trip/options（TDX 站間時間與公告票價）
 *   天氣           **情境示範**。後端只有「現在」與八小時摘要，沒有逐時資料；
 *                  而且這組畫面講的是下雨天，接即時天氣的話晴天 demo 會自相矛盾
 *
 * 起訖用站名再查座標，而不是自己存座標：估價頁收到的也是站名（from / to），
 * 兩邊走同一條 lookupPlace，座標才會逐位相同、快取鍵才對得上。
 */

/** 情境的退路起訖。跟 RainyCommuteScreen / UvAlertScreen 的情境同一組。 */
const FALLBACK_FROM = '板橋'
const FALLBACK_TO = '市政府'

/*
 * 情境天氣（設計稿 499:1800 / 499:2185 的數字）。
 * 畫面上凡是用到這組的地方，都要掛「情境示範」或「示意」標籤。
 */
export const RAINY_SCENARIO = {
  time: '08:00',
  temperatureC: 22,
  feelsLikeC: 21,
  condition: '有雨',
  rainChance: 80,
  updatedAt: '07:50',
  outfit: '薄外套、防滑鞋；隨身帶傘。',
} as const

export type HourlyKind = 'rain' | 'showers' | 'cloudy'

export const RAINY_HOURLY: Array<{
  time: string
  kind: HourlyKind
  label: string
  temperatureC: number
  rainChance: number
}> = [
  { time: '08:00', kind: 'rain', label: '有雨', temperatureC: 22, rainChance: 80 },
  { time: '09:00', kind: 'rain', label: '有雨', temperatureC: 22, rainChance: 80 },
  { time: '10:00', kind: 'showers', label: '陣雨', temperatureC: 23, rainChance: 70 },
  { time: '11:00', kind: 'showers', label: '陣雨', temperatureC: 23, rainChance: 60 },
  { time: '12:00', kind: 'cloudy', label: '多雲', temperatureC: 24, rainChance: 40 },
  { time: '13:00', kind: 'cloudy', label: '多雲', temperatureC: 24, rainChance: 30 },
]

/* ── 通勤偏好 ───────────────────────────────────────────── */

export type CommutePref = 'walk' | 'time' | 'budget'

export const COMMUTE_PREFS: Array<{ id: CommutePref; label: string }> = [
  { id: 'walk', label: '少走路' },
  { id: 'time', label: '省時間' },
  { id: 'budget', label: '省預算' },
]

export function isCommutePref(value: unknown): value is CommutePref {
  return value === 'walk' || value === 'time' || value === 'budget'
}

/*
 * 記住上次選的偏好。子頁的「返回通勤推薦」是直接導回 /rainy/commute，
 * 不記的話使用者剛選的「省預算」一回來就變回預設，看起來像按鈕沒作用。
 * 只放記憶體：這是這一趟 demo 的事，不需要跨工作階段。
 */
let lastPref: CommutePref = 'walk'

export const getLastPref = () => lastPref
export function rememberPref(pref: CommutePref) {
  lastPref = pref
}

/* ── 資料 ───────────────────────────────────────────────── */

export type MetroState =
  | { status: 'loading' }
  | { status: 'ready'; option: MetroOption }
  /** 查不到捷運選項（站太遠、TDX 沒金鑰或掛了）。畫面照實說，不要編數字。 */
  | { status: 'none' }

export type RainyCommute = {
  /** 上車站名（使用者路線的起點） */
  from: string
  to: string
  /** 使用者真的設定過上班路線；false 代表用的是情境的退路 */
  configured: boolean
  ride: RideEstimateState
  metro: MetroState
  /** 進估價頁的網址。car 是車型偏好（估價頁目前不讀，見回報） */
  rideHref: (car?: string) => string
}

export function useRainyCommute(): RainyCommute {
  const { route, configured } = useCommuteRoute('commute')
  const from = route?.origin ?? FALLBACK_FROM
  const to = route?.destination ?? FALLBACK_TO

  const pickupState = useResolvedPlace(from, null, null)
  const dropoffState = useResolvedPlace(to, null, null)

  /*
   * 估價與交通比較的 hook 把座標物件放在 effect 相依裡，
   * 每次 render 給新物件會一直重跑 —— 用座標數值記住同一個物件。
   */
  const pLat = pickupState.status === 'ready' ? pickupState.place.lat : null
  const pLon = pickupState.status === 'ready' ? pickupState.place.lon : null
  const dLat = dropoffState.status === 'ready' ? dropoffState.place.lat : null
  const dLon = dropoffState.status === 'ready' ? dropoffState.place.lon : null
  const pickup = useMemo(
    () => (pLat !== null && pLon !== null ? { lat: pLat, lon: pLon } : null),
    [pLat, pLon],
  )
  const dropoff = useMemo(
    () => (dLat !== null && dLon !== null ? { lat: dLat, lon: dLon } : null),
    [dLat, dLon],
  )

  const unresolved = pickupState.status === 'none' || dropoffState.status === 'none'

  const rideState = useRideEstimate(pickup, dropoff)
  const options = useTripOptions(pickup, dropoff)

  const ride: RideEstimateState = unresolved ? { status: 'error' } : rideState

  let metro: MetroState = { status: 'loading' }
  if (unresolved || options.status === 'error') metro = { status: 'none' }
  else if (options.status === 'ready') {
    const option = options.data.options.find((o): o is MetroOption => o.mode === 'metro')
    metro = option ? { status: 'ready', option } : { status: 'none' }
  }

  const rideHref = (car?: string) =>
    `/ride/estimate?${new URLSearchParams({ from, to, ...(car ? { car } : {}) })}`

  return { from, to, configured, ride, metro, rideHref }
}

/** 捷運全程的戶外步行分鐘數（進站前 + 出站後）。雨天要撐傘的就是這段。 */
export function outdoorWalkMinutes(metro: MetroOption): number {
  return metro.fromStation.walkMinutes + metro.toStation.walkMinutes
}

/** 「08:00」加幾分鐘 → 「08:28」。情境出發時間推抵達時間用。 */
export function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = (h * 60 + m + minutes) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
