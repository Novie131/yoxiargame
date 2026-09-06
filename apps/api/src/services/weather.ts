/*
 * 即時天氣與短時預報。首頁的標題列與 agent 的 get_weather 工具共用這裡，
 * 兩邊的數字才不會對不起來。
 *
 * 資料來源（都免金鑰）：
 *   Open-Meteo      氣溫、體感、天氣狀況、紫外線指數、逐時預報
 *   BigDataCloud    反向地理編碼：座標 → 行政區
 *   Nominatim       正向地理編碼：地名 → 座標
 *
 * 之後要換成中央氣象署（到 opendata.cwa.gov.tw 申請免費金鑰）時，
 * 只需要換掉 fetchForecast 的內容，對外型別不用動。
 */

/*
 * 一則提醒。
 *
 * 從「只挑一則」改成陣列，是因為那個設計會漏掉最需要講的組合：
 * 下雨天同時也可能只有 14 度，原本的 if-else 講完傘就結束了，
 * 使用者穿短袖出門淋雨又發抖。現在全部算出來，由呼叫端決定顯示幾則。
 */
export type WeatherAdvice = {
  kind: 'umbrella' | 'heat' | 'cold' | 'uv' | 'clothing' | 'swing'
  title: string
  body: string
}

/** 往後幾小時的預報摘要。要回答「等一下出門會不會下雨」就得靠它。 */
export type WeatherOutlook = {
  /** 這份摘要往後看了幾小時 */
  hours: number
  minTemperatureC: number
  maxTemperatureC: number
  /** 這段時間內最高的降雨機率（%） */
  maxPrecipitationProbability: number
  /** 降雨機率首次超過門檻的時刻（HH:MM，當地時間）。整段都不會下就是 null。 */
  rainStartsAt: string | null
  maxUvIndex: number
}

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
  /*
   * 首頁標題列那張小卡用的「最值得講的一件事」。
   * 刻意排除穿著建議 —— 穿著建議每一種天氣都有，放進來的話這張卡就永遠都在，
   * 失去「有事才提醒」的意義。要完整清單請用 advices。
   */
  advice: WeatherAdvice | null
  /** 全部提醒，含穿著建議。給 agent 與對話卡片用。 */
  advices: WeatherAdvice[]
  /** 逐時預報拿不到時為 null，此時 advices 只依現況推導 */
  outlook: WeatherOutlook | null
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

/*
 * 預報往後看幾小時。
 *
 * 8 小時涵蓋「出門 → 在外面 → 回家」這個範圍。取更長（例如 24 小時）的話，
 * 半夜三點的那場雨會讓下午出門的人被叫去帶傘，那是在製造雜訊；
 * 取更短則答不出「傍晚回家會不會下雨」。
 */
const OUTLOOK_HOURS = 8

/*
 * 建議帶傘的降雨機率門檻（%）。
 * 中央氣象署的慣例是 30% 就值得帶傘 —— 傘沒用到的成本遠低於淋濕。
 * 提醒文字一律附上實際機率與時間，讓使用者自己判斷要不要聽。
 */
const RAIN_PROBABILITY_THRESHOLD = 30

/* 這個溫差以上就值得提醒早晚加件外套 */
const TEMPERATURE_SWING_THRESHOLD = 8

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

/*
 * 穿著建議。依**體感溫度**分級而不是氣溫 ——
 * 濕度 85% 的 26 度跟乾燥的 26 度，穿一樣的衣服是兩種體驗，
 * 而體感溫度已經把濕度與風速算進去了。
 *
 * 級距抓得比溫帶地區窄，因為台灣人對 20 度以下的反應比較敏感。
 */
function clothingAdvice(feelsLikeC: number): WeatherAdvice {
  const at = `體感 ${feelsLikeC}°C`

  if (feelsLikeC >= 32) {
    return { kind: 'clothing', title: '穿輕薄短袖', body: `${at}，選透氣排汗的材質，記得帶水` }
  }
  if (feelsLikeC >= 28) {
    return { kind: 'clothing', title: '穿短袖', body: `${at}，室內冷氣強的話帶件薄外套` }
  }
  if (feelsLikeC >= 24) {
    return { kind: 'clothing', title: '短袖就夠', body: `${at}，早晚可能需要薄長袖` }
  }
  if (feelsLikeC >= 20) {
    return { kind: 'clothing', title: '長袖或薄外套', body: `${at}，單穿短袖傍晚會有點涼` }
  }
  if (feelsLikeC >= 16) {
    return { kind: 'clothing', title: '記得帶外套', body: `${at}，建議薄長袖加一件外套` }
  }
  if (feelsLikeC >= 12) {
    return { kind: 'clothing', title: '穿保暖外套', body: `${at}，內搭長袖，外面要有厚度` }
  }
  return { kind: 'clothing', title: '穿厚外套', body: `${at}，圍巾與帽子會差很多` }
}

/*
 * 把現況與預報合成一組提醒。
 *
 * 順序就是重要性順序：會不會淋濕 > 會不會熱昏或冷到 > 紫外線 > 穿什麼 > 溫差。
 * 呼叫端可以只取第一則（首頁小卡），也可以全部帶給模型（對話）。
 */
function buildAdvices(
  current: { precipitationMm: number; temperatureC: number; feelsLikeC: number; uvIndex: number },
  outlook: WeatherOutlook | null,
): WeatherAdvice[] {
  const advices: WeatherAdvice[] = []

  if (current.precipitationMm > 0) {
    advices.push({
      kind: 'umbrella',
      title: '目前有降雨',
      body: '出門記得帶傘，或改搭捷運與計程車',
    })
  } else if (outlook && outlook.maxPrecipitationProbability >= RAIN_PROBABILITY_THRESHOLD) {
    /* 機率與時間都講出來，使用者才有辦法自己判斷要不要帶 */
    const when = outlook.rainStartsAt ? `約 ${outlook.rainStartsAt} 起` : `未來 ${outlook.hours} 小時內`
    advices.push({
      kind: 'umbrella',
      title: '等一下可能下雨',
      body: `${when}降雨機率 ${outlook.maxPrecipitationProbability}%，建議帶傘`,
    })
  }

  if (current.temperatureC >= 32) {
    advices.push({ kind: 'heat', title: '高溫提醒', body: '避免長時間曝曬，多補充水分' })
  } else if (current.temperatureC <= 15) {
    advices.push({ kind: 'cold', title: '氣溫偏低', body: '外出記得多加一件外套' })
  }

  const uv = Math.max(current.uvIndex, outlook?.maxUvIndex ?? 0)
  if (uv >= 6) {
    advices.push({
      kind: 'uv',
      title: '紫外線偏高',
      body: `指數 ${uv}（${uvLevelText(uv)}），記得防曬與補充水分`,
    })
  }

  advices.push(clothingAdvice(current.feelsLikeC))

  if (outlook && outlook.maxTemperatureC - outlook.minTemperatureC >= TEMPERATURE_SWING_THRESHOLD) {
    advices.push({
      kind: 'swing',
      title: '早晚溫差大',
      body: `接下來 ${outlook.hours} 小時在 ${outlook.minTemperatureC}° 到 ${outlook.maxTemperatureC}° 之間，外套帶著`,
    })
  }

  return advices
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

type OpenMeteoHourly = {
  time: string[]
  temperature_2m: number[]
  apparent_temperature: number[]
  precipitation_probability: number[]
  uv_index: number[]
}

async function fetchForecast(
  lat: number,
  lon: number,
): Promise<{ current: OpenMeteoCurrent; hourly: OpenMeteoHourly | null }> {
  const url =
    `${OPEN_METEO}?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,uv_index' +
    '&hourly=temperature_2m,apparent_temperature,precipitation_probability,uv_index' +
    /* 跨夜的行程要看得到明天早上，所以要兩天 */
    '&forecast_days=2&timezone=auto'

  const data = (await getJson(url)) as { current?: OpenMeteoCurrent; hourly?: OpenMeteoHourly }
  if (!data.current) throw new Error('Open-Meteo 沒有回傳 current 區塊')
  return { current: data.current, hourly: data.hourly ?? null }
}

/*
 * 逐時陣列 → 摘要。
 *
 * 起點要對齊「現在這個小時」：hourly 是從今天 00:00 開始的整天資料，
 * 直接從索引 0 取的話，下午查會拿到凌晨的天氣（踩過）。
 */
function summarize(current: OpenMeteoCurrent, hourly: OpenMeteoHourly | null): WeatherOutlook | null {
  if (!hourly?.time?.length) return null

  const currentHour = current.time.slice(0, 13)
  let start = hourly.time.findIndex((t) => t.slice(0, 13) === currentHour)
  if (start < 0) start = hourly.time.findIndex((t) => t >= current.time)
  if (start < 0) return null

  const end = Math.min(start + OUTLOOK_HOURS, hourly.time.length)
  if (end <= start) return null

  let minTemp = Infinity
  let maxTemp = -Infinity
  let maxProbability = 0
  let maxUv = 0
  let rainStartsAt: string | null = null

  for (let i = start; i < end; i++) {
    const temp = hourly.temperature_2m?.[i]
    if (typeof temp === 'number') {
      if (temp < minTemp) minTemp = temp
      if (temp > maxTemp) maxTemp = temp
    }

    const probability = hourly.precipitation_probability?.[i]
    if (typeof probability === 'number') {
      if (probability > maxProbability) maxProbability = probability
      if (rainStartsAt === null && probability >= RAIN_PROBABILITY_THRESHOLD) {
        /* 「2026-09-07T15:00」→「15:00」 */
        rainStartsAt = hourly.time[i].slice(11, 16)
      }
    }

    const uv = hourly.uv_index?.[i]
    if (typeof uv === 'number' && uv > maxUv) maxUv = uv
  }

  if (!Number.isFinite(minTemp) || !Number.isFinite(maxTemp)) return null

  return {
    hours: end - start,
    minTemperatureC: Math.round(minTemp),
    maxTemperatureC: Math.round(maxTemp),
    maxPrecipitationProbability: Math.round(maxProbability),
    rainStartsAt,
    maxUvIndex: Math.round(maxUv * 10) / 10,
  }
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

export type GeocodedPlace = { lat: number; lon: number; displayName: string; shortName: string }

/**
 * 地名 → 座標。行政區、地標、車站都吃得下（Nominatim 的一般搜尋）。
 * 給 agent 工具與前端的「手動選擇位置」用。
 */
export async function geocodePlace(name: string): Promise<GeocodedPlace | null> {
  const query = name.trim()
  if (!query) return null

  return cached(`geo:${query}`, GEOCODE_TTL_MS, async () => {
    const url =
      `${FORWARD_GEOCODE}?q=${encodeURIComponent(query)}` +
      '&format=jsonv2&limit=1&countrycodes=tw&accept-language=zh-TW'
    const data = (await getJson(url)) as Array<{ lat: string; lon: string; display_name: string }>
    const hit = data[0]
    if (!hit) return null

    /*
     * display_name 是完整地址（「大安森林公園, 溫州街, 龍坡里, 大安區, …」），
     * 整串塞進卡片標題會很醜。第一段就是使用者認得的那個名字。
     */
    return {
      lat: Number(hit.lat),
      lon: Number(hit.lon),
      displayName: hit.display_name,
      shortName: hit.display_name.split(',')[0]?.trim() || query,
    }
  })
}

/** 座標 → 「臺北市信義區」。給前端顯示定位結果用。 */
export async function describePlace(lat: number, lon: number): Promise<string | null> {
  return cached(`rev:${lat.toFixed(2)},${lon.toFixed(2)}`, GEOCODE_TTL_MS, async () => {
    const place = await reverseGeocode(lat, lon).catch(() => ({ city: null, district: null }))
    return [place.city, place.district].filter(Boolean).join('') || null
  })
}

export async function getWeather(lat: number, lon: number): Promise<Weather> {
  /* 座標取到小數第二位（約 1 公里）就夠了，也讓快取真的會命中 */
  const key = `wx:${lat.toFixed(2)},${lon.toFixed(2)}`

  return cached(key, WEATHER_TTL_MS, async () => {
    /* 地理編碼掛掉不該讓整個天氣掛掉，所以分開處理失敗 */
    const [forecast, place] = await Promise.all([
      fetchForecast(lat, lon),
      reverseGeocode(lat, lon).catch(() => ({ city: null, district: null })),
    ])

    const { current, hourly } = forecast
    const isDay = current.is_day === 1
    const base = {
      temperatureC: Math.round(current.temperature_2m),
      feelsLikeC: Math.round(current.apparent_temperature),
      humidity: Math.round(current.relative_humidity_2m),
      condition: conditionText(current.weather_code, isDay),
      precipitationMm: current.precipitation,
      uvIndex: Math.round(current.uv_index * 10) / 10,
    }

    /* 逐時預報是加分項，拿不到就只用現況推導提醒，不要讓整個天氣掛掉 */
    let outlook: WeatherOutlook | null = null
    try {
      outlook = summarize(current, hourly)
    } catch (error) {
      console.error('[weather] 逐時預報解析失敗：', error)
    }

    const advices = buildAdvices(base, outlook)

    return {
      ...base,
      city: place.city,
      district: place.district,
      location: [place.city, place.district].filter(Boolean).join('') || null,
      isDay,
      uvLevel: uvLevelText(base.uvIndex),
      /* 首頁小卡只要「有事才提醒」的那幾種，穿著建議每天都有，不算事件 */
      advice: advices.find((a) => a.kind !== 'clothing') ?? null,
      advices,
      outlook,
      observedAt: current.time,
    }
  })
}
