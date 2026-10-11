/*
 * 兩點之間的開車道路距離（公尺），向公開的 OSRM demo 伺服器要。
 *
 * 為什麼估價要多這一步：叫車流程的地圖畫的是 OSRM 的道路路線
 * （apps/mobile 的 lib/drivingRoute.ts），估價原本卻是直線距離乘繞路係數。
 * 兩邊各量各的，地圖上那條線跟面板上的公里數就對不上。
 * 改成同一個伺服器、同一組座標，線與數字才是同一條路。
 *
 * 只拿距離、不拿 OSRM 的時間：公開伺服器的車程是不看路況的自由車流，
 * 尖峰時段會嚴重樂觀。車程照舊由 services/ride.ts 依時段車速算。
 *
 * 拿不到（逾時、限流、離線、結果不合理）一律回 null，呼叫端退回直線 × 係數 ——
 * 最壞情況就是改之前的樣子，不會讓估價壞掉。
 */

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'

/* 估價頁在等這個數字。比前端畫線的三秒短一點，退回估算總比讓人乾等好 */
const TIMEOUT_MS = 2_500

/*
 * 道路距離不會變，可以放久一點。Worker 的記憶體不保證留著，
 * 這只是省掉「估價頁、Agent、雨天頁接連問同一段」的重複請求。
 */
const CACHE_TTL_MS = 30 * 60_000
const MAX_CACHE_ENTRIES = 300
const cache = new Map<string, { at: number; meters: number }>()

/*
 * 道路距離跟直線距離差太多，多半是起訖點被吸附到錯的路上
 * （山上、河濱、高架橋下），那種數字拿去算車資只會更離譜。
 */
const MAX_DETOUR_RATIO = 4

type LatLon = { lat: number; lon: number }

/* 小數第五位（約 1 公尺），跟前端畫線的快取鍵同精度 */
function keyOf(from: LatLon, to: LatLon): string {
  return `${from.lon.toFixed(5)},${from.lat.toFixed(5)};${to.lon.toFixed(5)},${to.lat.toFixed(5)}`
}

export async function roadDistanceMeters(
  from: LatLon,
  to: LatLon,
  straightMeters: number,
): Promise<number | null> {
  const key = keyOf(from, to)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.meters

  try {
    /*
     * 座標照原樣送、不先四捨五入：前端畫線送的也是原始座標，
     * 兩邊送一樣的東西，OSRM 才會回同一條路。
     */
    const res = await fetch(`${OSRM_BASE}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { code?: string; routes?: Array<{ distance?: unknown }> }
    const meters = body.code === 'Ok' ? Number(body.routes?.[0]?.distance) : NaN
    if (!Number.isFinite(meters) || meters <= 0) return null
    /* 很近的兩點（同一條街對面）直線可能只有幾十公尺，比例會很大，用絕對值放寬 */
    if (meters > straightMeters * MAX_DETOUR_RATIO + 1_000) return null

    if (cache.size >= MAX_CACHE_ENTRIES) cache.clear()
    cache.set(key, { at: Date.now(), meters })
    return meters
  } catch (error) {
    /* 逾時（TimeoutError）、斷網、JSON 壞掉：退回估算，記一筆就好 */
    console.warn('[road-distance]', error instanceof Error ? error.name : error)
    return null
  }
}
