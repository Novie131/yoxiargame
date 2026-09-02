/*
 * 即時天氣。首頁的標題列與 agent 的 get_weather 工具共用這裡，
 * 兩邊的數字才不會對不起來。
 *
 * 資料來源（都免金鑰）：
 *   Open-Meteo      氣溫、天氣狀況、紫外線指數
 *   BigDataCloud    反向地理編碼：座標 → 行政區
 *   Nominatim       正向地理編碼：行政區 → 座標（給工具用，使用者只講「信義區」時）
 *
 * 之後要換成中央氣象署（到 opendata.cwa.gov.tw 申請免費金鑰）時，
 * 只需要換掉 fetchCurrent 的內容，對外型別不用動。
 */

export type Weather = {
  city: string | null
  district: string | null
  /** 「臺北市信義區」，兩者都拿不到時為 null */
  location: string | null
  temperatureC: number
  feelsLikeC: number
  humidity: number
  condition: string
  isDay: boolean
  precipitationMm: number
  uvIndex: number
  uvLevel: string
  /** 依天氣導出的提醒，沒有值得提醒的事情時為 null */
  advice: { title: string; body: string } | null
  observedAt: string
}

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'
const REVERSE_GEOCODE = 'https://api.bigdatacloud.net/data/reverse-geocode-client'
const FORWARD_GEOCODE = 'https://nominatim.openstreetmap.org/search'

/* Nominatim 的使用條款要求帶可識別的 User-Agent，而且限制每秒一次請求 */
const USER_AGENT = 'yoxi-argame/0.1 (https://yoxiargame.pages.dev)'

const TIMEOUT_MS = 8000
const WEATHER_TTL_MS = 10 * 60 * 1000
const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000

type Cached<T> = { at: number; value: T }
const cache = new Map<string, Cached<unknown>>()

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.value as T

  const value = await load()
  cache.set(key, { at: Date.now(), value })
  /* Workers 的 isolate 會被重複使用，順手清掉過期的，別讓 Map 無限長大 */
  if (cache.size > 200) {
    for (const [k, v] of cache) if (Date.now() - v.at > GEOCODE_TTL_MS) cache.delete(k)
  }
  return value
}

async function getJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${new URL(url).host} 回應 ${res.status}`)
  return res.json()
}

/* WMO 天氣代碼 → 中文描述。用台灣氣象預報的慣用詞。 */
function conditionText(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? '晴' : '晴朗'
  if (code === 1) return '晴時多雲'
  if (code === 2) return '多雲'
  if (code === 3) return '陰'
  if (code === 45 || code === 48) return '有霧'
  if (code >= 51 && code <= 57) return '毛毛雨'
  if (code === 61 || code === 80) return '短暫陣雨'
  if (code === 63 || code === 81) return '陣雨'
  if (code === 65 || code === 82) return '大雨'
  if (code === 66 || code === 67) return '凍雨'
  if (code >= 71 && code <= 77) return '下雪'
  if (code === 85 || code === 86) return '陣雪'
  if (code === 95) return '雷陣雨'
  if (code === 96 || code === 99) return '雷雨伴冰雹'
  return '—'
}

/* 中央氣象署的紫外線分級 */
function uvLevelText(uv: number): string {
  if (uv < 3) return '低量級'
  if (uv < 6) return '中量級'
  if (uv < 8) return '高量級'
  if (uv < 11) return '過量級'
  return '危險級'
}

/* 首頁右上角那張提示卡的內容。挑最值得講的一件事就好，不要疊一堆。 */
function adviceFor(w: {
  precipitationMm: number
  uvIndex: number
  temperatureC: number
  condition: string
}): Weather['advice'] {
  if (w.precipitationMm > 0) {
    return { title: '目前有降雨', body: '記得帶傘，或改搭捷運與計程車' }
  }
  if (w.uvIndex >= 6) {
    return { title: '紫外線偏高', body: '記得防曬與補充水分' }
  }
  if (w.temperatureC >= 32) {
    return { title: '高溫提醒', body: '避免長時間曝曬，多補充水分' }
  }
  if (w.temperatureC <= 15) {
    return { title: '氣溫偏低', body: '外出記得多加一件外套' }
  }
  return null
}

type OpenMeteoCurrent = {
  temperature_2m: number
  apparent_temperature: number
  relative_humidity_2m: number
  is_day: number
  precipitation: number
  weather_code: number
  uv_index: number
  time: string
}

async function fetchCurrent(lat: number, lon: number): Promise<OpenMeteoCurrent> {
  const url =
    `${OPEN_METEO}?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,uv_index' +
    '&timezone=auto'
  const data = (await getJson(url)) as { current?: OpenMeteoCurrent }
  if (!data.current) throw new Error('Open-Meteo 沒有回傳 current 區塊')
  return data.current
}

/*
 * 座標 → 行政區。
 * 只取 city 與 locality 兩個欄位；BigDataCloud 的行政區階層清單裡
 * 混有其他來源的主權標記，不要往外送。
 */
async function reverseGeocode(lat: number, lon: number) {
  const url = `${REVERSE_GEOCODE}?latitude=${lat}&longitude=${lon}&localityLanguage=zh`
  const data = (await getJson(url)) as { city?: string; locality?: string }
  const city = data.city?.trim() || null
  const district = data.locality?.trim() || null
  return { city, district: district && district !== city ? district : null }
}

/** 行政區名稱 → 座標。給 agent 工具用，使用者只會講「信義區」。 */
export async function geocodeDistrict(name: string) {
  const key = `geo:${name}`
  return cached(key, GEOCODE_TTL_MS, async () => {
    const url =
      `${FORWARD_GEOCODE}?q=${encodeURIComponent(name)}` +
      '&format=jsonv2&limit=1&countrycodes=tw&accept-language=zh-TW'
    const data = (await getJson(url)) as Array<{ lat: string; lon: string; display_name: string }>
    const hit = data[0]
    if (!hit) return null
    return { lat: Number(hit.lat), lon: Number(hit.lon), displayName: hit.display_name }
  })
}

export async function getWeather(lat: number, lon: number): Promise<Weather> {
  /* 座標取到小數第二位（約 1 公里）就夠了，也讓快取真的會命中 */
  const key = `wx:${lat.toFixed(2)},${lon.toFixed(2)}`

  return cached(key, WEATHER_TTL_MS, async () => {
    /* 地理編碼掛掉不該讓整個天氣掛掉，所以分開處理失敗 */
    const [current, place] = await Promise.all([
      fetchCurrent(lat, lon),
      reverseGeocode(lat, lon).catch(() => ({ city: null, district: null })),
    ])

    const isDay = current.is_day === 1
    const base = {
      temperatureC: Math.round(current.temperature_2m),
      feelsLikeC: Math.round(current.apparent_temperature),
      humidity: Math.round(current.relative_humidity_2m),
      condition: conditionText(current.weather_code, isDay),
      precipitationMm: current.precipitation,
      uvIndex: Math.round(current.uv_index * 10) / 10,
    }

    return {
      ...base,
      city: place.city,
      district: place.district,
      location: [place.city, place.district].filter(Boolean).join('') || null,
      isDay,
      uvLevel: uvLevelText(base.uvIndex),
      advice: adviceFor(base),
      observedAt: current.time,
    }
  })
}
