import { useEffect, useState } from 'react'

import { API_URL } from './api'
import { useLocationState, type UserLocation } from './location'

/*
 * 首頁標題列的即時天氣。
 *
 * 流程是：瀏覽器定位 → 呼叫自家 /weather → 後端代打 Open-Meteo 與反向地理編碼。
 * 不直接從瀏覽器打第三方，CORS 與之後換資料來源都由後端吸收。
 *
 * 定位交給 lib/location（探索地圖也用同一份），被拒或逾時會退回台北市信義區，
 * 並標記 precise=false —— 畫面上要讓使用者知道那不是他真正的所在地。
 */

export type WeatherAdvice = {
  kind: 'umbrella' | 'heat' | 'cold' | 'uv' | 'clothing' | 'swing'
  title: string
  body: string
}

/** 往後幾小時的預報摘要。回答「等一下出門會不會下雨」靠它。 */
export type WeatherOutlook = {
  hours: number
  minTemperatureC: number
  maxTemperatureC: number
  maxPrecipitationProbability: number
  /** HH:MM，整段都不會下就是 null */
  rainStartsAt: string | null
  maxUvIndex: number
}

export type Weather = {
  city: string | null
  district: string | null
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
   * 首頁標題列那張小卡用的「最值得講的一件事」，沒有事就是 null。
   * 後端刻意把穿著建議排除在外 —— 它每天都有，放進來這張卡就永遠都在。
   */
  advice: WeatherAdvice | null
  /** 全部提醒，含穿著建議 */
  advices: WeatherAdvice[]
  outlook: WeatherOutlook | null
  observedAt: string
}

export type WeatherState =
  | { status: 'loading' }
  | { status: 'ready'; weather: Weather; precise: boolean }
  | { status: 'error'; message: string }

const TTL_MS = 10 * 60 * 1000

/*
 * 快取要跟著座標走。
 *
 * 以前只存 { at, weather }，所以使用者按下「開啟定位」或手動改了地點之後，
 * 十分鐘內畫面還是顯示舊地方的天氣 —— 而且標題列會一直掛著「（未定位）」，
 * 看起來像按鈕壞掉了。把座標放進 key，位置一換快取自然就不命中。
 */
type Snapshot = { at: number; key: string; weather: Weather; precise: boolean }

/* 小數第三位約 100 公尺。再細下去只是讓快取永遠不命中。 */
const keyOf = (lat: number, lon: number) => `${lat.toFixed(3)},${lon.toFixed(3)}`

let snapshot: Snapshot | null = null
let inflight: Promise<Snapshot> | null = null

function fresh(s: Snapshot | null, key: string): s is Snapshot {
  return s !== null && s.key === key && Date.now() - s.at < TTL_MS
}

async function load(location: UserLocation, key: string): Promise<Snapshot> {
  const res = await fetch(`${API_URL}/weather?lat=${location.lat}&lon=${location.lon}`)
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.error ?? `伺服器回應 ${res.status}`)
  }

  return {
    at: Date.now(),
    key,
    weather: (await res.json()) as Weather,
    precise: location.precise,
  }
}

/* 多個畫面同時掛載時共用同一次請求，也共用十分鐘內的結果 */
function get(location: UserLocation, key: string): Promise<Snapshot> {
  if (fresh(snapshot, key)) return Promise.resolve(snapshot)
  if (!inflight) {
    inflight = load(location, key)
      .then((s) => {
        snapshot = s
        return s
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function useWeather(): WeatherState {
  const { location, status } = useLocationState()
  const key = keyOf(location.lat, location.lon)

  const [state, setState] = useState<WeatherState>(() =>
    fresh(snapshot, key)
      ? { status: 'ready', weather: snapshot.weather, precise: snapshot.precise }
      : { status: 'loading' },
  )

  useEffect(() => {
    /*
     * 還在等定位就先不要打。這時候手上只有退路座標（信義區），打了會先
     * 閃一下別人的天氣再換掉 —— 而且那一下使用者分不出是不是他所在地。
     */
    if (status === 'locating') return

    if (fresh(snapshot, key)) {
      setState({ status: 'ready', weather: snapshot.weather, precise: snapshot.precise })
      return
    }

    let alive = true
    setState({ status: 'loading' })

    get(location, key)
      .then((s) => {
        if (alive) setState({ status: 'ready', weather: s.weather, precise: s.precise })
      })
      .catch((e: unknown) => {
        if (alive) {
          setState({
            status: 'error',
            message: e instanceof Error ? e.message : '天氣資料暫時無法取得',
          })
        }
      })

    return () => {
      alive = false
    }
    /* location 物件每次都是新的，所以相依用 key 而不是它本身 */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, status])

  return state
}
