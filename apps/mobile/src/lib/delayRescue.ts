import type { CommuteRoute } from './commute'

/*
 * 「通勤延誤救援」示範情境的劇本。
 *
 * 對應設計稿四張 frame：iphone-lockscreen-notification、delay-rescue-modal、
 * yoxi-fare-settlement、fare-settlement-delay-rescue。
 *
 * ── 哪些是真的，哪些不是 ──
 *
 *   台鐵 1234 誤點 25 分、08:45 → 09:10、節省 22 分鐘
 *       **腳本**。照設計稿寫死。transit-watch 目前只盯臺北捷運，
 *       台鐵的即時誤點還沒接（見 CommuteSetupScreen 的運具說明），
 *       所以這一段是在演「接上之後會長什麼樣子」。
 *
 *   救援彈窗上的車資
 *       **真的估價**。跟估價頁用同一組 hook、同一份快取 ——
 *       設計稿寫 NT$185，但那個數字跟下一頁算出來的對不上，
 *       demo 裡前後兩個畫面就會互相打臉（雨天那頁拿掉車資是同一個理由）。
 *
 *   叫車之後
 *       跟其他入口同一條流程（估價 → 模擬派車 → 行程 → 結算），
 *       差別只在這一趟被標記為救援（lib/ride 的 markNextRideAsRescue）。
 *
 * 四張畫面共用這裡的數字，改劇本只改這一處 —— 散在各頁的話，
 * 鎖定畫面說省 22 分、結算頁說省 20 分，觀眾一眼就會看出來。
 */
export const RESCUE_SCENARIO = {
  /** 結算頁橫幅只講業者（「比台鐵延誤提早…」），其他地方講到班次 */
  operator: '台鐵',
  train: '台鐵 1234',
  delayMinutes: 25,
  /** 原本搭這班車會到公司的時間 */
  scheduledArrival: '08:45',
  /** 誤點之後的預計抵達 */
  delayedArrival: '09:10',
  /** 改叫車比等誤點的車早到幾分鐘 */
  savedMinutes: 22,
  /** 鎖定畫面上的時間。早於原本抵達時間，故事才說得通 */
  lockscreenTime: '08:15',
} as const

/*
 * 沒設定通勤路線時的退路，跟雨天、紫外線兩頁同一組起訖 ——
 * demo 從哪個情境進叫車流程，看到的路線都一樣。
 */
const FALLBACK_ROUTE = { from: '板橋', to: '市政府' } as const

/**
 * 救援叫車的起訖站名。
 *
 * 有設定通勤路線就用他自己的（「帶他去公司」才是救援的意思），
 * 沒有就用示範路線。只給站名不給座標：估價頁會自己查（lib/ride 的 useResolvedPlace），
 * 這裡再查一次的話兩邊可能查出不同的點，車資就對不上了。
 */
export function rescueRoute(route: CommuteRoute | null): { from: string; to: string } {
  if (route?.origin && route.destination) return { from: route.origin, to: route.destination }
  return FALLBACK_ROUTE
}

/** 進叫車流程的網址。跟雨天頁一樣直接進估價頁，起訖已知就不用再選一次 */
export function rescueRideUrl(route: { from: string; to: string }): string {
  return `/ride/estimate?${new URLSearchParams(route)}`
}
