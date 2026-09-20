import { taipeiNow, toMinutes } from './clock.ts'
import { applySchedule, type ScheduledPlan } from './metro-schedule.ts'
import { planMetroRoutes } from './route-planner.ts'
import { estimateRide, type RideEstimate } from './ride.ts'
import { findStationPosition, hasTdxCredentials } from './tdx.ts'

/*
 * 「該出發了」。
 *
 * README 記過這個折衷：設計稿的行程卡寫「建議 08:05 出發」，但反推出發時間
 * 需要知道使用者幾點要到，而通勤設定沒收集那個欄位，所以改成從現在正推
 * （「現在出發約 N 分鐘」）。那個折衷是對的，但它把一個功能降級成了資訊顯示 ——
 * 使用者得自己在心裡做減法，而他正在刷牙。
 *
 * 008 補上 arrive_by 之後，這個減法我們做得了：
 *
 *   再 6 分鐘出門，或現在叫車還來得及。
 *
 * 這句話同時用到路線規劃、真實班距、叫車估價，三個都已經做好了，
 * 缺的只是一個時間錨點。
 *
 * ── 這個功能估太樂觀的代價很高 ──
 * 倒數歸零代表「再不出門就會遲到」。估錯的話使用者錯過的是會議，不是一班車。
 * 所以這裡的每一個保守選擇都是刻意的：
 *   等車一律算期望值（班距的一半），而且照實講它不是保證
 *   班表或班距拿不到就降級成 low，不要用沒有時間概念的估計去倒數
 *   寧可早講：緩衝只加不減
 */

/*
 * 出門前的緩衝（分鐘）。
 *
 * 路線規劃算的是「從起站到迄站」，但使用者是從沙發上出發的 ——
 * 穿鞋、下樓、走到路口都不在那個數字裡。
 *
 * 5 分鐘是一個保守但不荒謬的值。它不是量出來的，所以回傳時單獨列出來，
 * 讓畫面能講清楚「其中 5 分鐘是出門緩衝」，而不是把它藏進總時間裡。
 */
const LEAVE_HOME_BUFFER_MINUTES = 5

/*
 * 倒數只在出發前這麼多分鐘內才有意義（分鐘）。
 *
 * 早上七點就開始倒數「再 95 分鐘出門」不是提醒，是雜訊。
 * 超過這個範圍就回 null，讓畫面退回原本的「現在出發約 N 分鐘」。
 */
const COUNTDOWN_WINDOW_MINUTES = 90

/*
 * 已經過了建議出發時間多久之後就不再倒數（分鐘）。
 *
 * 遲到 40 分鐘的人不需要一個一直在數負數的卡片 —— 他早就知道了。
 */
const OVERDUE_GRACE_MINUTES = 30

export type DepartureConfidence = 'normal' | 'low'

export type DeparturePlan = {
  /** 使用者設定的抵達時間，HH:MM */
  arriveBy: string
  /** 建議幾點出門，HH:MM。已經含出門緩衝。 */
  departBy: string
  /*
   * 距離建議出發還有幾分鐘。
   * 負數代表已經過了建議出發時間 —— 畫面要講「已經該出門了」而不是顯示負號。
   */
  minutesUntilDeparture: number
  /** 門到門：車程 + 轉乘 + 期望等車 + 出門緩衝 */
  totalMinutes: number
  /*
   * 其中的期望等車。**班距的一半，是期望值不是保證** ——
   * 剛好錯過一班就是等一整個班距。畫面要有辦法講出這件事。
   */
  waitMinutes: number
  /** 其中的出門緩衝。單獨列出來，不要藏進總時間裡。 */
  bufferMinutes: number
  /*
   * 這個倒數有多可信。
   *   normal 班表與班距都拿得到
   *   low    少了其中一份，或這一段現在沒有車 —— 畫面要明顯地降級顯示
   */
  confidence: DepartureConfidence
  /** confidence 為 low 時說明是少了哪一份資料；normal 時是 null */
  caveat: string | null
  /*
   * 這個倒數怎麼算出來的，要原封不動顯示。
   *
   * 跟 ride.ts 的 basis 同一個用意：使用者得知道等車是期望值不是保證，
   * 也得知道國定假日我們判斷不了。把這兩件事藏起來，倒數就變成一個
   * 看起來很確定、實際上會讓人遲到的數字。
   */
  basis: string
  /*
   * 來不及的話叫車要多少。
   *
   * 倒數歸零的那一刻使用者需要的是選項，不是壞消息。站點座標查不到時為 null。
   * 依公告費率估算，**不是 yoxi 報價**，basis 要一起顯示。
   */
  rideFallback: RideEstimate | null
}

/*
 * 國定假日判斷不了，見 clock.ts。
 *
 * 補班的週六會被當成假日（班距高估，倒數偏早 —— 這個方向還好），
 * 補假的週一會被當成平日（班距低估，倒數偏晚 —— 這個方向會讓人遲到）。
 * 路線查詢對這個誤差不敏感，倒數很敏感，所以一律在畫面上講出來。
 */
const BASIS =
  '等車以班距的一半估算（期望值，不是保證）；' +
  '國定假日與補班日的班距判斷不了，連假前後請自行多抓一點時間'

/** 分鐘數 → HH:MM，跨日往回捲 */
function toClock(minutes: number): string {
  const wrapped = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/*
 * 現在到抵達時間還有幾分鐘。
 *
 * 抵達時間是「今天的」，但設定 09:00 的人在 23:00 打開 App 時，指的是明天。
 * 一律往前看，所以過去的時刻自動捲到隔天 —— 否則深夜會倒數出一個負了十幾個
 * 小時的數字。
 */
function minutesUntilArrival(nowMinutes: number, arriveMinutes: number): number {
  const diff = arriveMinutes - nowMinutes
  return diff >= 0 ? diff : diff + 24 * 60
}

/*
 * 這個規劃可不可以拿來倒數。
 *
 * service 是 unknown 代表班表沒拿到；waitMinutes 是 0 但有搭車段代表班距沒拿到。
 * 兩種情況算出來的門到門時間都少了一塊，拿去倒數會系統性偏樂觀 ——
 * 而偏樂觀正是這個功能最不能犯的錯。
 */
function assess(plan: ScheduledPlan): { confidence: DepartureConfidence; caveat: string | null } {
  if (plan.service.status === 'closed') {
    return { confidence: 'low', caveat: '這條路線現在沒有營運，倒數只能當參考' }
  }
  if (plan.service.status === 'unknown') {
    return { confidence: 'low', caveat: '首末班車資料暫時拿不到，倒數可能不準' }
  }
  if (plan.waitMinutes === 0 && plan.legs.length > 0) {
    return { confidence: 'low', caveat: '班距資料暫時拿不到，這個時間沒有算等車' }
  }
  return { confidence: 'normal', caveat: null }
}

export type PlanDepartureInput = {
  origin: string
  destination: string
  /** HH:MM */
  arriveBy: string
}

/**
 * 出發倒數。
 *
 * 回傳 null 的情況都是「現在講這件事沒有意義」，不是錯誤：
 *   起訖站規劃不出捷運路線（公車路線、站名對不上）
 *   離出發還太久，或已經遲到太久
 * 呼叫端遇到 null 就退回「現在出發約 N 分鐘」的顯示。
 */
export async function planDeparture(
  input: PlanDepartureInput,
  at: Date = new Date(),
): Promise<DeparturePlan | null> {
  if (!hasTdxCredentials()) return null

  const arriveMinutes = toMinutes(input.arriveBy)
  if (arriveMinutes === null) return null

  const now = taipeiNow(at)
  const nowMinutes = toMinutes(now.time)
  if (nowMinutes === null) return null

  const routes = await planMetroRoutes(input.origin, input.destination)
  if (!routes) return null

  const plan = await applySchedule(routes.best, at)
  const { confidence, caveat } = assess(plan)

  const totalMinutes = plan.totalMinutes + LEAVE_HOME_BUFFER_MINUTES
  const departMinutes = arriveMinutes - totalMinutes
  const minutesUntilDeparture = minutesUntilArrival(nowMinutes, arriveMinutes) - totalMinutes

  /*
   * 視窗外就不講。兩個方向都要擋：太早是雜訊，太晚是馬後砲。
   */
  if (minutesUntilDeparture > COUNTDOWN_WINDOW_MINUTES) return null
  if (minutesUntilDeparture < -OVERDUE_GRACE_MINUTES) return null

  /*
   * 叫車估價只在來不及或快來不及時才算 —— 提早兩小時就把叫車價推到臉上，
   * 就是 trip-options 檔頭講的那種推銷。查不到座標就是 null，不要編一個。
   */
  const rideFallback =
    minutesUntilDeparture <= 0
      ? await Promise.all([
          findStationPosition(input.origin),
          findStationPosition(input.destination),
        ])
          .then(([from, to]) =>
            from && to
              ? estimateRide({ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon }, at)
              : null,
          )
          .catch((error: unknown) => {
            console.error('[departure] 叫車估價失敗：', error)
            return null
          })
      : null

  return {
    arriveBy: input.arriveBy,
    departBy: toClock(departMinutes),
    minutesUntilDeparture,
    totalMinutes,
    waitMinutes: plan.waitMinutes,
    bufferMinutes: LEAVE_HOME_BUFFER_MINUTES,
    confidence,
    caveat,
    /* 資料全都拿到時也要講 —— 假日與等車的不確定性跟資料有沒有拿到無關 */
    basis: BASIS,
    rideFallback,
  }
}
