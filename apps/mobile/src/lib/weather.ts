import { useEffect, useState } from 'react'

import { API_URL } from './api'
import { locate } from './location'

/*
 * 首頁標題列的即時天氣。
 *
 * 流程是：瀏覽器定位 → 呼叫自家 /weather → 後端代打 Open-Meteo 與反向地理編碼。
 * 不直接從瀏覽器打第三方，CORS 與之後換資料來源都由後端吸收。
 *
 * 定位交給 lib/location（探索地圖也用同一份），被拒或逾時會退回台北市信義區，
 * 並標記 precise=false —— 畫面上要讓使用者知道那不是他真正的所在地。
 */

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
  advice: { title: string; body: string } | null
  observedAt: string
}

export type WeatherState =
  | { status: 'loading' }
  | { status: 'ready'; weather: Weather; precise: boolean }
  | { status: 'error'; message: string }

const TTL_MS = 10 * 60 * 1000

type Snapshot = { at: number; weather: Weather; precise: boolean }

let snapshot: Snapshot | null = null
let inflight: Promise<Snapshot> | null = null

function fresh(s: Snapshot | null): s is Snapshot {
  return s !== null && Date.now() - s.at < TTL_MS
}

async function load(): Promise<Snapshot> {
  const { lat, lon, precise } = await locate()

  const res = await fetch(`${API_URL}/weather?lat=${lat}&lon=${lon}`)
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.error ?? `伺服器回應 ${res.status}`)
  }

  return { at: Date.now(), weather: (await res.json()) as Weather, precise }
}

/* 多個畫面同時掛載時共用同一次請求，也共用十分鐘內的結果 */
function get(): Promise<Snapshot> {
  if (fresh(snapshot)) return Promise.resolve(snapshot)
  if (!inflight) {
    inflight = load()
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
  const [state, setState] = useState<WeatherState>(() =>
    fresh(snapshot)
      ? { status: 'ready', weather: snapshot.weather, precise: snapshot.precise }
      : { status: 'loading' },
  )

  useEffect(() => {
    /* 讀 snapshot 而不是 state，effect 才不用把 state 列進相依 */
    if (fresh(snapshot)) return
    let alive = true

    get()
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
    /* 只在掛載時取一次；十分鐘內的重複請求由 get() 的快取擋掉 */
  }, [])

  return state
}
