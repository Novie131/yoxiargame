import { taipeiNow, withinWindow } from './clock.ts'
import { haversineMeters } from './tdx.ts'

/*
 * 叫車估價。
 *
 * **這不是 yoxi 的報價。** yoxi 的估價 API 是非公開的合作項目，還沒接上。
 * 這裡算的是「依臺北市公告計程車費率，跑這段距離大概要多少錢」——
 * 一個有公式、有來源、可以自己驗算的估計值。
 *
 * 為什麼要做這個而不是繼續回假數字：
 *
 * 在這之前 estimate_ride 回的是對齊設計稿的 8.5 公里 / NT$250-320，
 * 不管使用者要去哪裡都一樣。那跟 trip-options.ts「沒有來源就不給數字」的
 * 立場是直接矛盾的 —— 一個寫死的數字看起來跟真的一樣，比空白更危險。
 *
 * 現在每個數字都推得出來：距離來自兩點座標，車資來自公告費率，
 * 區間的上下界各自代表一種路況。接上 yoxi 之後換掉這個檔案就好，
 * 呼叫端拿到的形狀不用改。
 */

/*
 * ── 臺北市計程車費率 ──
 *
 * 費率是會調整的公告值。調整時只改這個區塊，其餘邏輯不用動。
 * 以臺北市公共運輸處公告的日間費率為準；跨縣市（新北、基隆）目前沿用同一組，
 * 短程差異在估計區間內，不值得為此多維護一份表。
 */
const TARIFF = {
  /** 起程價，含前 1.25 公里 */
  baseFare: 85,
  baseMeters: 1_250,
  /** 續程：每 200 公尺 5 元 */
  perStepFare: 5,
  stepMeters: 200,
  /** 延滯計時：每 60 秒 5 元（停等、時速 5 公里以下） */
  waitFarePerMinute: 5,
  /** 夜間加成，每趟。23:00–06:00 */
  nightSurcharge: 20,
  nightFrom: '23:00',
  nightTo: '06:00',
} as const

/*
 * 直線距離 → 實際道路距離的放大係數。
 *
 * 跟 trip-options.ts 的步行繞路係數同一個道理，但車的值更大一點：
 * 行人可以穿小巷、走對角，車要照單行道與幹道走。
 *
 * 這是估計值。真正要準得有道路網的路徑規劃，而我們只有捷運路網。
 */
const ROAD_DETOUR_FACTOR = 1.4

/*
 * 市區平均車速（公里/小時），含號誌等待。
 *
 * 分三段而不是給一個固定值：同一段路尖峰與深夜差快一倍，
 * 用單一車速會讓早上八點的估計嚴重樂觀。
 */
const SPEED_KMH = {
  peak: 18,
  offPeak: 25,
  night: 35,
} as const

/* 平日尖峰。假日不套用 —— 假日的壅塞不集中在通勤時段。 */
const PEAK_WINDOWS = [
  ['07:00', '09:30'],
  ['17:00', '19:30'],
] as const

/*
 * 估計區間的上界假設有多少比例的時間在停等。
 *
 * 下界是 0（一路順暢，只收里程費），上界是行程時間的三成走走停停。
 * 這樣區間的兩端各自對應一種真實路況，而不是在中位數上下隨便抓個百分比 ——
 * 使用者問「為什麼是這個範圍」時答得出來。
 */
const CONGESTED_WAIT_RATIO = 0.3

export type RideEstimate = {
  /** 估計的道路距離（公里，一位小數） */
  distanceKm: number
  /** 估計車程（分鐘） */
  durationMinutes: number
  /** 預計抵達時間，HH:MM（臺北時間） */
  eta: string
  fare: { min: number; max: number }
  /** 這一趟落在哪個路況假設 */
  traffic: 'peak' | 'offPeak' | 'night'
  /** 有沒有夜間加成 */
  nightSurcharge: boolean
  /**
   * 這些數字怎麼來的，要原封不動顯示給使用者看。
   * 呼叫端不要自己改寫成「預估車資」了事 —— 來源被拿掉，它就又變成一個假數字。
   */
  basis: string
}

function trafficAt(now = taipeiNow()): 'peak' | 'offPeak' | 'night' {
  if (withinWindow(now.time, TARIFF.nightFrom, TARIFF.nightTo)) return 'night'
  if (now.weekend) return 'offPeak'
  const peak = PEAK_WINDOWS.some(([from, to]) => withinWindow(now.time, from, to))
  return peak ? 'peak' : 'offPeak'
}

/** 里程費。續程不足一段也要跳一段，所以是無條件進位。 */
function distanceFare(meters: number): number {
  if (meters <= TARIFF.baseMeters) return TARIFF.baseFare
  const steps = Math.ceil((meters - TARIFF.baseMeters) / TARIFF.stepMeters)
  return TARIFF.baseFare + steps * TARIFF.perStepFare
}

/**
 * 估算一趟車。
 *
 * 只需要兩端座標 —— 呼叫端負責把地名解析成座標（services/place.ts）。
 * 這裡不做地理編碼，才能同時給 agent 工具與 /ride/estimate 端點用。
 */
export function estimateRide(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  at: Date = new Date(),
): RideEstimate {
  const now = taipeiNow(at)
  const traffic = trafficAt(now)

  const straightMeters = haversineMeters(from.lat, from.lon, to.lat, to.lon)
  const roadMeters = straightMeters * ROAD_DETOUR_FACTOR

  const speed = SPEED_KMH[traffic]
  const durationMinutes = Math.max(1, Math.round((roadMeters / 1_000 / speed) * 60))

  const night = traffic === 'night'
  const base = distanceFare(roadMeters) + (night ? TARIFF.nightSurcharge : 0)

  /*
   * 上界：加上塞車的延滯計時。深夜不加 —— 那個時段的壅塞假設不成立，
   * 硬加會讓凌晨三點的估價區間憑空寬一截。
   */
  const waitMinutes = night ? 0 : Math.round(durationMinutes * CONGESTED_WAIT_RATIO)
  const max = base + waitMinutes * TARIFF.waitFarePerMinute

  /* 抵達時間用臺北時間往後推，不能用伺服器時區 */
  const eta = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(at.getTime() + durationMinutes * 60_000))

  return {
    distanceKm: Math.round((roadMeters / 1_000) * 10) / 10,
    durationMinutes,
    eta,
    /* 取整到 5 元，跳表本來就是 5 元一跳，給到個位數是假精確 */
    fare: { min: Math.round(base / 5) * 5, max: Math.round(max / 5) * 5 },
    traffic,
    nightSurcharge: night,
    basis: '依臺北市公告計程車費率估算，非 yoxi 實際報價',
  }
}
