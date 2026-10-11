import { useState } from 'react'

import { useCommuteRoute, type CommuteRoute } from './commute'
import { timeAfterMinutes } from './datetime'
import { useResolvedPlace, useRideEstimate, type RidePlace } from './ride'

/*
 * 「通勤延誤救援」示範情境的劇本。
 *
 * 對應設計稿四張 frame：iphone-lockscreen-notification、delay-rescue-modal、
 * yoxi-fare-settlement、fare-settlement-delay-rescue。
 *
 * ── 哪些是真的，哪些不是 ──
 *
 *   台鐵 1234 誤點 25 分
 *       **腳本**。transit-watch 目前只盯臺北捷運，台鐵的即時誤點還沒接
 *       （見 CommuteSetupScreen 的運具說明），所以這一段是在演「接上之後會長什麼樣子」。
 *
 *   時間
 *       **跟著現在走**，不寫死某個時刻。鎖定畫面打開的那一刻是故事的起點，
 *       原本的抵達時間與誤點後的抵達時間都從那一刻往後推（設計稿的 08:15 → 08:45 → 09:10
 *       只取它的間隔）。寫死 08:15 的話，下午 demo 時鎖定畫面寫早上八點、
 *       估價頁卻寫傍晚抵達，前後兜不起來。
 *
 *   節省幾分鐘
 *       **算出來的**：誤點後的抵達時間 −（現在 + 叫車的即時車程）。
 *       以前寫死 22 分，但車程是即時估的，尖峰時段會變長 ——
 *       同一個畫面上「節省 22 分鐘」旁邊寫「車程約 44 分鐘」，一算就穿幫。
 *
 *   救援彈窗上的車資
 *       **真的估價**。跟估價頁用同一組 hook、同一份快取，按下去之後看到的是同一個數字。
 *
 *   叫車之後
 *       跟其他入口同一條流程（估價 → 模擬派車 → 行程 → 結算），
 *       差別只在這一趟被標記為救援（lib/ride 的 markNextRideAsRescue），
 *       並帶著按下當時算出的節省分鐘數，結算頁顯示的就是使用者在彈窗看到的那個數字。
 *
 * 各頁共用這裡的數字與算法，改劇本只改這一處。
 */
export const RESCUE_SCENARIO = {
  /** 結算頁橫幅只講業者（「比台鐵延誤提早…」），其他地方講到班次 */
  operator: '台鐵',
  train: '台鐵 1234',
  delayMinutes: 25,
  /** 推播當下，原本搭這班車還要多久到公司（設計稿 08:15 → 08:45） */
  minutesToScheduledArrival: 30,
} as const

/*
 * 故事的起點存在 sessionStorage：鎖定畫面 → 救援頁之間切頁、重新整理，
 * 時間都從同一刻算，才不會一頁差一分鐘。
 * 放超過一小時就當作新的一次 demo（直接開 /rescue 也會從現在開始）。
 */
const STARTED_KEY = 'yoxi.rescue.startedAt'
const STARTED_TTL_MS = 60 * 60_000

function readStartedAt(): number | null {
  try {
    const at = Number(sessionStorage.getItem(STARTED_KEY))
    return Number.isFinite(at) && at > 0 && Date.now() - at < STARTED_TTL_MS ? at : null
  } catch {
    return null
  }
}

function writeStartedAt(at: number): number {
  try {
    sessionStorage.setItem(STARTED_KEY, String(at))
  } catch {
    /* 存不進去頂多換頁時時間差一兩分鐘 */
  }
  return at
}

export type RescueClock = {
  /** 推播的時間（故事起點），HH:MM */
  notifiedAt: string
  /** 原本會到公司的時間，HH:MM */
  scheduledArrival: string
  /** 誤點之後的預計抵達，HH:MM */
  delayedArrival: string
  /** 誤點之後的預計抵達（epoch ms），算節省分鐘數用 */
  delayedAtMs: number
}

function clockFrom(startedAt: number): RescueClock {
  const from = new Date(startedAt)
  const { minutesToScheduledArrival, delayMinutes } = RESCUE_SCENARIO
  return {
    notifiedAt: timeAfterMinutes(0, from),
    scheduledArrival: timeAfterMinutes(minutesToScheduledArrival, from),
    delayedArrival: timeAfterMinutes(minutesToScheduledArrival + delayMinutes, from),
    delayedAtMs: startedAt + (minutesToScheduledArrival + delayMinutes) * 60_000,
  }
}

/**
 * 改叫車比等誤點的車早到幾分鐘。
 *
 * 往下取整：寧可少講一分鐘，也不要多講。≤ 0 代表叫車也不會比較快 ——
 * 那時畫面要照實說，不能還寫「節省」。
 */
function savedMinutesOf(clock: RescueClock, rideMinutes: number, now = Date.now()): number {
  return Math.floor((clock.delayedAtMs - (now + rideMinutes * 60_000)) / 60_000)
}

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

/**
 * 救援情境的全部數字：起訖、時間、即時估價、節省分鐘數。鎖定畫面與救援頁共用。
 *
 * restart：鎖定畫面是故事的開頭，每次打開都從現在重新起算；
 * 救援頁沿用鎖定畫面的起點（沒有就從現在開始）。
 *
 * here：查不到上車點時的退路（目前位置），跟估價頁一樣。由呼叫端給而不是在這裡拿定位 ——
 * 鎖定畫面不能拿：拿定位會跳權限詢問，出現在一張假的 iPhone 鎖定畫面上很怪。
 *
 * 起訖的解析方式與估價頁一致，座標相同，useRideEstimate 就會命中同一份快取 ——
 * 這裡與估價頁的車資、車程才會一致。
 */
export function useRescuePlan({ restart = false, here }: { restart?: boolean; here?: RidePlace } = {}) {
  const [startedAt] = useState(() => (restart ? writeStartedAt(Date.now()) : (readStartedAt() ?? writeStartedAt(Date.now()))))
  const clock = clockFrom(startedAt)

  const { route } = useCommuteRoute()
  const trip = rescueRoute(route)

  const pickupState = useResolvedPlace(trip.from, null, null, here)
  const dropoffState = useResolvedPlace(trip.to, null, null)
  const pickup = pickupState.status === 'ready' ? pickupState.place : null
  const dropoff = dropoffState.status === 'ready' ? dropoffState.place : null
  const estimate = useRideEstimate(pickup, dropoff)

  /** null = 估價還沒回來（或估不出來），這時不講節省幾分鐘 */
  const savedMinutes =
    estimate.status === 'ready' ? savedMinutesOf(clock, estimate.data.durationMinutes) : null

  return { trip, clock, pickupState, dropoffState, estimate, savedMinutes }
}
