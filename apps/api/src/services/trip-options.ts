import { estimateRideOnRoad, type RideEstimate } from './ride.ts'
import { planMetroRoutes, type RoutePlan } from './route-planner.ts'
import {
  findNearestStation,
  getMetroFare,
  hasTdxCredentials,
  haversineMeters,
  type MetroFare,
} from './tdx.ts'
import { getWeather } from './weather.ts'

/*
 * 「怎麼去」的選項比較。
 *
 * 給探索任務的詳情面板用：使用者點了一個任務，要知道走路、搭捷運、叫車
 * 各自的樣子，然後**自己選**。
 *
 * 這裡的立場很明確：不預設推叫車。三百公尺的任務跳出「叫車前往」，
 * 使用者只會學到這個 App 在推銷，然後不再相信它給的任何建議。
 * 所以排序一律照實際時間，叫車只是其中一個選項。
 *
 * 誠實範圍：
 *   捷運時間   TDX 實際站間行駛時間（route-planner）
 *   步行時間   由直線距離估算，見下面兩個常數
 *   叫車       依臺北市公告計程車費率估算（services/ride.ts），**不是 yoxi 報價**。
 *              這一欄原本刻意留白 —— 當時沒有任何來源，編一個
 *              「約 15 分鐘 / NT$250」比不給更糟。現在有公式也有來源了，
 *              所以給數字，但 basis 必須一起顯示。
 *   捷運票價   TDX 公告票價（ODFare）。查不到就是 null，不要用距離推。
 *   建議       由天氣、步行時間、車資湊出來的一句話，見下面的 buildAdvice。
 */

/*
 * 步行速度（公尺/分鐘）。4.8 km/h 是常用的行人規劃速度。
 * 這是估計值，不是量測值。
 */
const WALK_METERS_PER_MINUTE = 80

/*
 * 直線距離 → 實際步行距離的放大係數。
 *
 * 我們沒有步行路網，只能算直線；但人不能穿牆，市區實際要繞。
 * 1.3 是都市路網常用的繞路係數。同樣是估計值。
 */
const DETOUR_FACTOR = 1.3

/*
 * 超過這個距離就不列走路。
 *
 * 抓 2 公里（步行約 30 分）而不是更短，是因為門檻設太低會變成「幫使用者
 * 先排除掉他可能想選的選項」—— 有人就是願意走。列出來讓排序自己說話，
 * 比替他決定好。
 */
const WALKABLE_METERS = 2_000

/*
 * 願意為了搭捷運走多遠去車站。超過就代表捷運不是這一趟的合理選項 ——
 * 為了搭三站捷運先走二十分鐘沒有意義。
 */
export const MAX_WALK_TO_STATION_METERS = 1_200

/**
 * 直線距離 → 估計步行分鐘數。
 * 對外開放是因為 agent 的路線規劃也要用同一套估法 ——
 * 兩邊各估各的，同一段路會在對話與面板上出現兩個不同的數字。
 */
export const estimateWalkMinutes = (straightMeters: number) =>
  Math.max(1, Math.round((straightMeters * DETOUR_FACTOR) / WALK_METERS_PER_MINUTE))

export type WalkOption = {
  mode: 'walk'
  minutes: number
  distanceMeters: number
}

export type MetroOption = {
  mode: 'metro'
  /** 走路到起站 + 車程 + 走路到目的地 */
  totalMinutes: number
  fromStation: { name: string; walkMinutes: number }
  toStation: { name: string; walkMinutes: number }
  /*
   * 公告票價。查不到時為 null —— 比較頁就只顯示時間，不要用距離推一個數字。
   *
   * 沒有它的話，這個面板講的是「捷運少花 8 分鐘」這種半句話：
   * 省 8 分鐘要多付 40 元跟要多付 225 元是完全不同的決定。
   */
  fare: MetroFare | null
  plan: RoutePlan
  /*
   * 同一組起訖站的其他搭法（少轉一次、走不同線）。
   * 可能是空陣列 —— 直達的短程通常就真的只有一種合理走法。
   */
  alternatives: RoutePlan[]
}

export type RideOption = {
  mode: 'ride'
  distanceMeters: number
  /*
   * 依公告費率估算。estimate.basis 說明數字怎麼來的，
   * 畫面上要顯示它 —— 使用者得知道這不是 yoxi 的報價。
   */
  estimate: RideEstimate
}

export type TripOption = WalkOption | MetroOption | RideOption

/*
 * 「這一趟值不值得叫車」。
 *
 * 這是**建議**，不是排序 —— options 的順序永遠照實際時間，不會因為建議而動。
 * 兩者分開的理由在下面 buildAdvice 的註解。
 */
export type TripAdvice = {
  /*
   * ride = 這趟值得叫車；transit = 不值得，走路或捷運就好。
   * 這個欄位一定要能出現 transit，否則這個功能就只是一個包裝過的推銷。
   */
  verdict: 'ride' | 'transit'
  /** 一句話的結論，例如「下雨，這段叫車 NT$95 划算」 */
  headline: string
  /** 憑什麼這樣講。使用者要能自己判斷我們的理由成不成立。 */
  reason: string
}

export type TripOptions = {
  distanceMeters: number
  /** 已經在目的地附近，不需要移動 */
  arrived: boolean
  /** 依實際時間排序；沒有時間依據的叫車固定排在最後 */
  options: TripOption[]
  /*
   * 有明確答案時的一句建議，沒有就是 null。
   *
   * 「沒有明確答案」是常態 —— 大部分的趟次本來就沒有一個標準答案，
   * 硬要每次都講一句，使用者很快就會學會跳過它。
   */
  advice: TripAdvice | null
}

/* ── 「值不值得」的門檻 ─────────────────────────────────────── */

/*
 * 降雨機率超過這個百分比就算「在下雨的情境」。
 * 跟 weather.ts 的帶傘門檻同一個值，兩邊講的是同一件事，不要各抓各的。
 */
const RAIN_PROBABILITY_THRESHOLD = 30

/*
 * 淋得到雨的步行時間下限（分鐘）。
 *
 * 走 3 分鐘淋不濕，不需要為它叫車；超過這個數字才開始有差。
 */
const WET_WALK_MINUTES = 8

/*
 * 「不淋濕值這個價」的上限（元）。
 *
 * 一百元上下是大多數人不會猶豫的金額。超過就不該替使用者決定 ——
 * 那變成我們在花他的錢。
 */
const WORTH_IT_FARE = 120

/*
 * 叫車比捷運貴這麼多（元）以上，就值得反過來勸他別叫。
 * 搭配下面的時間差一起判斷：貴很多但也快很多，那是他自己的取捨，我們不插嘴。
 */
const EXPENSIVE_GAP_TWD = 200

/*
 * 捷運只慢這麼多分鐘以內，就算「沒慢多少」。
 * 超過的話「多花 200 元只換 8 分鐘」這句話就不成立了。
 */
const MARGINAL_SLOWER_MINUTES = 10

/*
 * 一句建議。給不出明確答案時回 null。
 *
 * ── 為什麼這一層不動排序 ──
 * MissionSheet 的檔頭寫過這個立場：「三百公尺的任務跳出叫車前往，
 * 使用者只會學到這個 App 在推銷」。排序是誠實比較的骨架，建議是上面的一句話；
 * 讓建議去改排序，等於把推銷藏進一個看起來中立的清單裡。
 *
 * 所以這裡只做兩件事，而且兩件都要做得到：
 *   下雨、要走一段、車資不貴      → 說「叫車吧」
 *   叫車貴很多、捷運也沒慢多少    → 說「別叫，搭捷運」
 */
function buildAdvice(
  options: TripOption[],
  raining: boolean,
): TripAdvice | null {
  const walk = options.find((o): o is WalkOption => o.mode === 'walk')
  const metro = options.find((o): o is MetroOption => o.mode === 'metro')
  const ride = options.find((o): o is RideOption => o.mode === 'ride')
  if (!ride) return null

  /* 車資用區間的下界。上界是塞車情境，拿它來勸人叫車會系統性高估 */
  const rideFare = ride.estimate.fare.min

  /*
   * 該說「別叫車」的情況先判斷。
   *
   * 順序是有意的：兩邊都成立時（下雨、但叫車貴到離譜）該講的是後者。
   * 下雨不是無限預算的理由。
   */
  if (metro) {
    const metroFare = metro.fare?.singleJourney ?? null
    const slower = metro.totalMinutes - ride.estimate.durationMinutes
    if (
      metroFare !== null &&
      rideFare - metroFare >= EXPENSIVE_GAP_TWD &&
      slower <= MARGINAL_SLOWER_MINUTES
    ) {
      /*
       * 捷運比叫車快是很常見的（長程、尖峰都會），這時候講「只多花 0 分鐘」
       * 既難讀又把自己的論點講弱了。兩個方向分開講。
       */
      const timePhrase =
        slower > 0 ? `捷運只多花 ${slower} 分鐘` : slower < 0 ? `捷運還快 ${-slower} 分鐘` : '時間一樣'
      return {
        verdict: 'transit',
        headline: `這段叫車貴 NT$${rideFare - metroFare}，${timePhrase}`,
        reason:
          `捷運 NT$${metroFare}、約 ${metro.totalMinutes} 分鐘；` +
          `叫車約 NT$${rideFare} 起、約 ${ride.estimate.durationMinutes} 分鐘。`,
      }
    }
  }

  /* 下雨、而且真的要走一段、而且不貴 */
  if (raining && rideFare <= WORTH_IT_FARE) {
    const walkMinutes = walk?.minutes ?? metro?.fromStation.walkMinutes ?? null
    if (walkMinutes !== null && walkMinutes >= WET_WALK_MINUTES) {
      return {
        verdict: 'ride',
        headline: `正在下雨，這段叫車約 NT$${rideFare}`,
        reason: `不叫車的話要在雨中走 ${walkMinutes} 分鐘。${ride.estimate.basis}。`,
      }
    }
  }

  return null
}

/*
 * 現在會不會淋到雨。
 *
 * 「正在下」與「等一下會下」都算 —— 使用者是現在要出門的。
 * 天氣查不到就回 false，寧可不給建議，也不要靠猜的天氣叫人花錢。
 */
async function isRaining(lat: number, lon: number): Promise<boolean> {
  try {
    const weather = await getWeather(lat, lon)
    if (weather.precipitationMm > 0) return true
    const probability = weather.outlook?.maxPrecipitationProbability ?? 0
    return probability >= RAIN_PROBABILITY_THRESHOLD
  } catch (error) {
    console.error('[trip-options] 天氣取得失敗，這次不給建議：', error)
    return false
  }
}

/* 這個距離內就當作「到了」，不用再給交通建議 */
const ARRIVED_METERS = 150

export async function compareTripOptions(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): Promise<TripOptions> {
  const distanceMeters = Math.round(haversineMeters(fromLat, fromLon, toLat, toLon))

  if (distanceMeters <= ARRIVED_METERS) {
    return { distanceMeters, arrived: true, options: [], advice: null }
  }

  const options: TripOption[] = []

  if (distanceMeters <= WALKABLE_METERS) {
    options.push({ mode: 'walk', minutes: estimateWalkMinutes(distanceMeters), distanceMeters })
  }

  /* 捷運：兩端都要有走得到的車站，而且不能是同一站（同站代表捷運幫不上忙） */
  if (hasTdxCredentials()) {
    try {
      const [from, to] = await Promise.all([
        findNearestStation(fromLat, fromLon),
        findNearestStation(toLat, toLon),
      ])

      if (
        from &&
        to &&
        from.stationId !== to.stationId &&
        from.distanceMeters <= MAX_WALK_TO_STATION_METERS &&
        to.distanceMeters <= MAX_WALK_TO_STATION_METERS
      ) {
        const routes = await planMetroRoutes(from.name, to.name)
        if (routes) {
          const fromWalk = estimateWalkMinutes(from.distanceMeters)
          const toWalk = estimateWalkMinutes(to.distanceMeters)
          /*
           * 票價查不到不影響這個選項的存在 —— 少一個數字，不是少一個選擇。
           * ODFare 是靜態資料且快取一天，所以這裡不會每次比較都打 TDX。
           */
          const fare = await getMetroFare(from.stationId, to.stationId).catch(
            (error: unknown) => {
              console.error('[trip-options] 票價取得失敗：', error)
              return null
            },
          )
          options.push({
            mode: 'metro',
            totalMinutes: fromWalk + routes.best.totalMinutes + toWalk,
            fromStation: { name: from.name, walkMinutes: fromWalk },
            toStation: { name: to.name, walkMinutes: toWalk },
            fare,
            plan: routes.best,
            alternatives: routes.alternatives,
          })
        }
      }
    } catch (error) {
      /* 規劃失敗就少一個選項，不要讓整個面板壞掉 */
      console.error('[trip-options] 捷運規劃失敗：', error)
    }
  }

  /*
   * 叫車永遠是一個選項。現在它有估計時間了，所以跟其他選項一起排序 ——
   * 以前固定墊底是因為沒有時間依據，不是因為要壓低它。
   *
   * 排序照實際時間，叫車常常會排到第一。這沒有問題：三公里的路它本來就最快。
   * 不預設推叫車的意思是「不插隊」，不是「一律排最後」。
   */
  options.push({
    mode: 'ride',
    distanceMeters,
    estimate: await estimateRideOnRoad({ lat: fromLat, lon: fromLon }, { lat: toLat, lon: toLon }),
  })

  /* 依實際時間排序。有依據的排前面，這是「誠實比較」的具體意思。 */
  options.sort((a, b) => {
    const t = (o: TripOption) =>
      o.mode === 'walk'
        ? o.minutes
        : o.mode === 'metro'
          ? o.totalMinutes
          : o.estimate.durationMinutes
    return t(a) - t(b)
  })

  /*
   * 建議是最後一步，而且是在**排序之後**算的：它只讀已經排好的選項，
   * 沒有機會回頭去動順序。這個先後不是實作細節，是上面那條立場的保證。
   */
  const advice = buildAdvice(options, await isRaining(fromLat, fromLon))

  return { distanceMeters, arrived: false, options, advice }
}
