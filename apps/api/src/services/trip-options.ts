import { planMetroRoute, type RoutePlan } from './route-planner.ts'
import { findNearestStation, hasTdxCredentials, haversineMeters } from './tdx.ts'

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
 *   叫車       **沒有時間也沒有車資** —— 我們沒有任何資料來源，
 *              所以只給動作，不給數字。編一個「約 15 分鐘 / NT$250」
 *              比不給更糟。
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
const MAX_WALK_TO_STATION_METERS = 1_200

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
  plan: RoutePlan
}

export type RideOption = {
  mode: 'ride'
  distanceMeters: number
  /*
   * 刻意沒有 minutes 與 fare：目前沒有接任何叫車服務的估價 API。
   * 等接上 yoxi 之後再補，在那之前畫面不要顯示編出來的數字。
   */
}

export type TripOption = WalkOption | MetroOption | RideOption

export type TripOptions = {
  distanceMeters: number
  /** 已經在目的地附近，不需要移動 */
  arrived: boolean
  /** 依實際時間排序；沒有時間依據的叫車固定排在最後 */
  options: TripOption[]
}

const walkMinutes = (straightMeters: number) =>
  Math.max(1, Math.round((straightMeters * DETOUR_FACTOR) / WALK_METERS_PER_MINUTE))

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
    return { distanceMeters, arrived: true, options: [] }
  }

  const options: TripOption[] = []

  if (distanceMeters <= WALKABLE_METERS) {
    options.push({ mode: 'walk', minutes: walkMinutes(distanceMeters), distanceMeters })
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
        const plan = await planMetroRoute(from.name, to.name)
        if (plan) {
          const fromWalk = walkMinutes(from.distanceMeters)
          const toWalk = walkMinutes(to.distanceMeters)
          options.push({
            mode: 'metro',
            totalMinutes: fromWalk + plan.totalMinutes + toWalk,
            fromStation: { name: from.name, walkMinutes: fromWalk },
            toStation: { name: to.name, walkMinutes: toWalk },
            plan,
          })
        }
      }
    } catch (error) {
      /* 規劃失敗就少一個選項，不要讓整個面板壞掉 */
      console.error('[trip-options] 捷運規劃失敗：', error)
    }
  }

  /* 依實際時間排序。有依據的排前面，這是「誠實比較」的具體意思。 */
  options.sort((a, b) => {
    const t = (o: TripOption) =>
      o.mode === 'walk' ? o.minutes : o.mode === 'metro' ? o.totalMinutes : Infinity
    return t(a) - t(b)
  })

  /* 叫車永遠可以選，但因為沒有時間依據，固定放最後 */
  options.push({ mode: 'ride', distanceMeters })

  return { distanceMeters, arrived: false, options }
}
