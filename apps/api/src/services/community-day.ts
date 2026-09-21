import type { CommunityDay, CommunityDayMission } from '../db/repositories/communityDay.ts'
import { estimateRide, type RideEstimate } from './ride.ts'
import { haversineMeters } from './tdx.ts'
import { estimateWalkMinutes } from './trip-options.ts'

/*
 * 社群日的「尋寶任務包」行程。
 *
 * Task.md 的原文是「AR 遊戲**行程設計**」與「精準導流」——
 * 把原本冷門的地點，透過遊戲中的任務包轉化為叫車目的地。
 *
 * 這一層做的就是那件事：給一場活動的多個任務點，排出一條**跑得完的順序**，
 * 並在每一段照實說「這段用走的」還是「這段值得叫車」。
 *
 * ── 這裡刻意不做什麼 ──
 * 「綠色共乘快線」字面上的多人共乘媒合**做不到**，而且不是暫時做不到：
 * 沒有登入（X-User-Ref 是裝置識別不是帳號）、沒有即時位置、沒有足夠的
 * 使用者密度。三個缺一不可，而我們三個都沒有。
 * FEATURES.md 的「不建議現在做」已經把它列進去了。
 *
 * 所以這裡給的是**一個人的最佳路線**，加上「今天有多少人也在跑這場」的
 * 聚合數字。那個數字是真的，而「附近有 N 個人可以跟你共乘」是假的 ——
 * 不要在任何地方把它講成後者。
 */

/*
 * 超過這個距離就不建議用走的，改推叫車。
 *
 * 跟 trip-options 的 WALKABLE_METERS（2 公里）不同，這裡抓得更嚴：
 * 那邊是「一趟」的判斷，這裡是連續要跑好幾段。一趟走 25 分鐘還行，
 * 連走五段就不行了 —— 人會在第三段放棄，然後這條行程等於沒用。
 */
const WALKABLE_BETWEEN_STOPS_METERS = 1_200

/*
 * 最多排幾個點。
 *
 * 不是演算法的限制，是人的限制：一次給十幾個點，使用者不會照著跑，
 * 他會看一眼然後關掉。而且下面的排序是 O(n²)，點數失控時也不划算。
 */
const MAX_STOPS = 8

export type ItineraryLeg = {
  /** 第幾段，從 1 開始 */
  order: number
  mission: CommunityDayMission
  /** 從上一個點（第一段是從使用者位置）到這裡的直線距離 */
  distanceMeters: number
  /** 建議怎麼移動到這一站 */
  mode: 'walk' | 'ride'
  walkMinutes: number
  /*
   * mode 為 ride 時的估價。依公告費率估算，**不是 yoxi 報價**，
   * basis 要跟著顯示。走得到的段落是 null —— 每段都附一個車資就是推銷。
   */
  ride: RideEstimate | null
}

export type Itinerary = {
  campaignId: string
  name: string
  endsAt: string | null
  /** 今天完成過這場活動任務的人數。是熱度，不是可共乘的人 —— 見檔頭。 */
  participantsToday: number
  /** 已完成的點不排進行程，但要讓畫面講得出「還剩幾個」 */
  remaining: number
  completed: number
  legs: ItineraryLeg[]
  /** 全程步行分鐘數（不含停留與任務本身花的時間） */
  totalWalkMinutes: number
  /** 這個行程怎麼算出來的，要原封不動顯示 */
  basis: string
}

const BASIS =
  '順序依直線距離就近排列，不是道路最短路徑；步行時間為估算值，不含在每個點停留的時間'

/*
 * 最近鄰排序 + 2-opt 改善。
 *
 * 為什麼不求最佳解：這是 TSP，點數再多一點就沒有便宜的最佳解。
 * 而且「最佳」在這裡本來就不精確 —— 我們用的是直線距離，不是走路距離，
 * 所以即使解出數學上的最佳順序，它也不是實際最短的路。
 *
 * 最近鄰會產生一條合理但偶爾會「繞回來」的路線；2-opt 掃一遍就能把那些
 * 明顯的交叉拉直，成本是 O(n²) 而點數上限只有 8。
 * 這個組合的產出對使用者來說已經看不出跟最佳解的差別。
 */
function orderByProximity(
  origin: { lat: number; lon: number },
  missions: CommunityDayMission[],
): CommunityDayMission[] {
  const remaining = [...missions]
  const route: CommunityDayMission[] = []
  let cursor = origin

  /* 最近鄰：每次都跳到離現在位置最近的那一個 */
  while (remaining.length > 0) {
    let bestIndex = 0
    let bestDistance = Infinity
    for (const [i, m] of remaining.entries()) {
      const d = haversineMeters(cursor.lat, cursor.lon, m.lat, m.lon)
      if (d < bestDistance) {
        bestDistance = d
        bestIndex = i
      }
    }
    const next = remaining.splice(bestIndex, 1)[0]
    route.push(next)
    cursor = next
  }

  /*
   * 2-opt：反轉任一段子路徑，如果總長變短就採用，直到沒有改善為止。
   * 路線的起點是使用者，而且沒有「回到起點」的需求，所以只算開放路徑的長度。
   */
  const legLength = (route: CommunityDayMission[]) => {
    let total = haversineMeters(origin.lat, origin.lon, route[0].lat, route[0].lon)
    for (let i = 0; i < route.length - 1; i++) {
      total += haversineMeters(route[i].lat, route[i].lon, route[i + 1].lat, route[i + 1].lon)
    }
    return total
  }

  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const candidate = [
          ...route.slice(0, i),
          ...route.slice(i, j + 1).reverse(),
          ...route.slice(j + 1),
        ]
        if (legLength(candidate) < legLength(route) - 1) {
          route.splice(0, route.length, ...candidate)
          improved = true
        }
      }
    }
  }

  return route
}

/**
 * 把一場社群日排成一條行程。
 *
 * 已完成的點會被排除 —— 行程是「接下來要做什麼」，不是活動的完整清單。
 * 全部完成時回傳空的 legs，呼叫端據此說「這場你跑完了」。
 */
export function planItinerary(
  day: CommunityDay,
  origin: { lat: number; lon: number },
  at: Date = new Date(),
): Itinerary {
  const completed = day.missions.filter((m) => m.completed).length
  const todo = day.missions.filter((m) => !m.completed).slice(0, MAX_STOPS)

  const ordered = todo.length > 0 ? orderByProximity(origin, todo) : []

  const legs: ItineraryLeg[] = []
  let cursor = origin
  let totalWalkMinutes = 0

  for (const [index, mission] of ordered.entries()) {
    const distanceMeters = Math.round(
      haversineMeters(cursor.lat, cursor.lon, mission.lat, mission.lon),
    )
    const walkMinutes = estimateWalkMinutes(distanceMeters)
    const ride = distanceMeters > WALKABLE_BETWEEN_STOPS_METERS

    legs.push({
      order: index + 1,
      mission,
      distanceMeters,
      mode: ride ? 'ride' : 'walk',
      walkMinutes,
      /*
       * 只有真的建議叫車的段落才算車資。每一段都附一個價錢，
       * 這張卡就變成一份報價單 —— 那不是行程規劃。
       */
      ride: ride
        ? estimateRide(cursor, { lat: mission.lat, lon: mission.lon }, at)
        : null,
    })

    /* 走路的段落才累加步行時間；叫車那段的時間在 ride.durationMinutes 裡 */
    if (!ride) totalWalkMinutes += walkMinutes
    cursor = mission
  }

  return {
    campaignId: day.campaignId,
    name: day.name,
    endsAt: day.endsAt,
    participantsToday: day.participantsToday,
    remaining: todo.length,
    completed,
    legs,
    totalWalkMinutes,
    basis: BASIS,
  }
}
