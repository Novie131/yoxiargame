import { haversineMeters } from './tdx.ts'

/*
 * 附近的店家與景點。
 *
 * 資料來源是 OpenStreetMap（經由 Overpass API）—— 跟正向地理編碼用的
 * Nominatim 同一份資料，不用金鑰，也是我們唯一拿得到的真實店家資料。
 * missions 資料表只有任務點，沒有營業時間、地址這些「去之前要知道的事」。
 *
 * 誠實範圍：
 *   店名、座標      OSM 社群維護，大致可靠
 *   營業時間、地址  有些店沒填，有些可能過時 —— 沒填就是 null，不要補
 *   圖片            OSM 沒有，所以卡片上沒有圖，也不要放一張假的
 *   距離            直線距離
 */

/*
 * 公開的 Overpass 是社群志願維運的，主站尖峰時常回 504（實測過連續兩次），
 * 所以失敗時換一個鏡像站再試一次。順序是主站優先 —— 鏡像站同樣不保證可用。
 */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
/* Overpass 的使用條款要求帶可識別的 User-Agent，跟 weather.ts 同一個 */
const USER_AGENT = 'yoxi-argame/0.1 (https://yoxiargame.pages.dev)'
const TIMEOUT_MS = 10_000

/*
 * 店家不會在半小時內搬家，同一區同一類的查詢沒必要每次都等 Overpass 七八秒。
 * 座標取到小數第三位（約 100 公尺）當鍵。Worker 的記憶體不保證留著，
 * 所以這只是省掉「同一個人換一個問法再問一次」的那一下，不是正式的快取層。
 */
const CACHE_TTL_MS = 30 * 60_000
const MAX_CACHE_ENTRIES = 200
const cache = new Map<string, { at: number; places: NearbyPlace[] }>()

/* 一次最多回幾家。卡片一次只顯示一家，多給的是「換一個」的備選。 */
const MAX_RESULTS = 5

/*
 * 店家種類 → OSM 標籤。
 *
 * 種類刻意收斂成使用者會講的那幾種，不開放任意標籤 ——
 * 模型會傳進奇怪的字串，而 Overpass 查不到時只會安靜地回空陣列，
 * 看起來就像「附近沒有咖啡廳」。
 */
export const PLACE_CATEGORIES = {
  cafe: { label: '咖啡廳', filters: ['["amenity"="cafe"]'] },
  bookstore: { label: '書店', filters: ['["shop"="books"]'] },
  restaurant: { label: '餐廳', filters: ['["amenity"="restaurant"]'] },
  dessert: {
    label: '甜點店',
    filters: ['["shop"="pastry"]', '["shop"="bakery"]', '["amenity"="ice_cream"]'],
  },
  bar: { label: '酒吧', filters: ['["amenity"="bar"]', '["amenity"="pub"]'] },
  park: { label: '公園', filters: ['["leisure"="park"]'] },
  museum: {
    label: '博物館與展覽',
    filters: ['["tourism"="museum"]', '["tourism"="gallery"]'],
  },
  attraction: {
    label: '景點',
    filters: ['["tourism"="attraction"]', '["tourism"="viewpoint"]'],
  },
} as const

export type PlaceCategory = keyof typeof PLACE_CATEGORIES

export const PLACE_CATEGORY_IDS = Object.keys(PLACE_CATEGORIES) as [
  PlaceCategory,
  ...PlaceCategory[],
]

export type NearbyPlace = {
  /** OSM 的元素 id（例如 node/123），前端拿來當 key */
  id: string
  name: string
  category: PlaceCategory
  lat: number
  lon: number
  distanceMeters: number
  /** OSM 的原始營業時間字串，例如「Mo-Su 10:00-22:00」。沒填就是 null。 */
  openingHours: string | null
  address: string | null
  phone: string | null
  website: string | null
}

type OverpassElement = {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

/*
 * 地址組回一行。有 addr:full 就用它；沒有就用區 + 路 + 門牌拼，
 * 只有一部分時寧可不給 —— 「中正區」三個字當地址沒有幫助。
 */
function addressOf(tags: Record<string, string>): string | null {
  if (tags['addr:full']) return tags['addr:full'].replace(/^\d{3,6}/, '')
  const street = tags['addr:street']
  const number = tags['addr:housenumber']
  if (!street || !number) return null
  return `${tags['addr:district'] ?? ''}${street}${number}號`
}

/** 座標附近某一類的店家，依直線距離由近到遠。 */
export async function findNearbyPlaces(
  lat: number,
  lon: number,
  category: PlaceCategory,
  radiusMeters = 1_000,
): Promise<NearbyPlace[]> {
  const around = `(around:${radiusMeters},${lat},${lon})`
  const selectors = PLACE_CATEGORIES[category].filters
    .map((f) => `nwr${f}["name"]${around};`)
    .join('')
  /* out center：公園、大型店面是 way，要它的中心點才有座標 */
  const query = `[out:json][timeout:8];(${selectors});out center tags 40;`

  const key = `${category}:${radiusMeters}:${lat.toFixed(3)},${lon.toFixed(3)}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.places

  const elements = await queryOverpass(query)
  const places = toPlaces(elements, lat, lon, category)

  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear()
  cache.set(key, { at: Date.now(), places })
  return places
}

async function queryOverpass(query: string): Promise<OverpassElement[]> {
  let lastError: unknown
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`overpass 回應 ${res.status}`)
      const body = (await res.json()) as { elements?: OverpassElement[] }
      return body.elements ?? []
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

function toPlaces(
  elements: OverpassElement[],
  lat: number,
  lon: number,
  category: PlaceCategory,
): NearbyPlace[] {
  return elements
    .flatMap((e): NearbyPlace[] => {
      const tags = e.tags ?? {}
      const pLat = e.lat ?? e.center?.lat
      const pLon = e.lon ?? e.center?.lon
      if (!tags.name || pLat === undefined || pLon === undefined) return []
      return [
        {
          id: `${e.type}/${e.id}`,
          name: tags.name,
          category,
          lat: pLat,
          lon: pLon,
          distanceMeters: Math.round(haversineMeters(lat, lon, pLat, pLon)),
          openingHours: tags.opening_hours ?? null,
          address: addressOf(tags),
          phone: tags.phone ?? tags['contact:phone'] ?? null,
          website: tags.website ?? tags['contact:website'] ?? null,
        },
      ]
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .filter(isNewPlace())
    .slice(0, MAX_RESULTS)
}

/* 同名而且距離這麼近的，當成同一家 */
const SAME_PLACE_METERS = 150

/*
 * OSM 常把同一家店畫兩次：一個點標店，一個面標建物，兩個都掛店名。
 * 不去掉的話「換一個推薦」會換到同一家。連鎖店的不同分店離得夠遠，不受影響。
 * 輸入已經由近到遠排好，所以留下來的是比較近的那一筆。
 */
function isNewPlace() {
  const kept: NearbyPlace[] = []
  return (p: NearbyPlace) => {
    const same = kept.find(
      (k) => k.name === p.name && haversineMeters(k.lat, k.lon, p.lat, p.lon) < SAME_PLACE_METERS,
    )
    if (!same) {
      kept.push(p)
      return true
    }
    /* 兩筆的資料常常各有缺漏（點有營業時間、面有地址），合併起來 */
    same.openingHours ??= p.openingHours
    same.address ??= p.address
    same.phone ??= p.phone
    same.website ??= p.website
    return false
  }
}
